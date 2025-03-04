// src/server/apiServer.ts
import express, { Request, Response, NextFunction } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { initializeSocketService, emitJobEvent, closeSocketService } from "../services/socketService.ts";
// Corregir importaciones de Bull Board
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import { rateLimit } from "express-rate-limit";

import {
  addJob,
  addBulkJobs,
  getJob,
  getJobsByParentId,
  getQueue,
  queueEmitter,
  JobType,
} from "../services/queueService.ts";
import { createBotWorkers } from "../workers/botWorkers.ts";
import logger from "../utils/logger.ts";

// Auxiliar: async/await en endpoints
function customAsyncHandler<
  Req extends Request = Request,
  Res extends Response = Response
>(handler: (req: Req, res: Res) => Promise<any>) {
  return (req: Req, res: Res, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

// Express app
const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api", apiLimiter);

// Middleware ficticio para userId - Corregido para evitar error TS2769
const userIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userId =
    (req.headers["x-user-id"] as string) || (req.query.userId as string);

  if (!userId) {
    res.status(401).json({
      error: "Unauthorized",
      message:
        "User ID is required. Provide it in x-user-id header or userId query parameter.",
    });
    return;
  }

  req.userId = userId;
  next();
};

app.use(userIdMiddleware);

// Router principal
const apiRouter = express.Router();

// GET /api/status
apiRouter.get("/status", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    userId: req.userId,
  });
});

// Añadir job basicBot
apiRouter.post(
  "/jobs/basic",
  customAsyncHandler(async (req, res) => {
    const { message, sessionData, parentId, priority } = req.body;
    if (!sessionData) {
      return res.status(400).json({ error: "Session data is required" });
    }

    const jobId = await addJob(
      "basicBot",
      req.userId,
      { message, sessionData },
      { parentId, priority }
    );

    return res.status(201).json({ jobId, message: "Job added successfully" });
  })
);

// Añadir job chatBot
apiRouter.post(
  "/jobs/chat",
  customAsyncHandler(async (req, res) => {
    const { messages, recipients, sessionData, parentId, priority } = req.body;

    if (!sessionData) {
      return res.status(400).json({ error: "Session data is required" });
    }
    if (!messages || (Array.isArray(messages) && messages.length === 0)) {
      return res
        .status(400)
        .json({ error: "At least one message is required" });
    }
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one recipient is required" });
    }

    const jobId = await addJob(
      "chatBot",
      req.userId,
      { messages, recipients, sessionData },
      { parentId, priority }
    );

    return res
      .status(201)
      .json({ jobId, message: "Chat job added successfully" });
  })
);

// Añadir job engagementBot
apiRouter.post(
  "/jobs/engagement",
  customAsyncHandler(async (req, res) => {
    const { sessionData, engagementOptions, strategyType, parentId, priority } =
      req.body;

    if (!sessionData) {
      return res.status(400).json({ error: "Session data is required" });
    }

    const jobId = await addJob(
      "engagementBot",
      req.userId,
      {
        sessionData,
        engagementOptions,
        strategyType: strategyType || "human-like",
      },
      { parentId, priority }
    );

    return res
      .status(201)
      .json({ jobId, message: "Engagement job added successfully" });
  })
);

// Añadir múltiples jobs
apiRouter.post(
  "/jobs/bulk/:jobType",
  customAsyncHandler(async (req, res) => {
    const { jobType } = req.params;
    const { dataItems, parentId, priority } = req.body;

    if (!dataItems || !Array.isArray(dataItems) || dataItems.length === 0) {
      return res.status(400).json({ error: "dataItems array is required" });
    }
    if (!["basicBot", "chatBot", "engagementBot"].includes(jobType)) {
      return res.status(400).json({ error: "Invalid job type" });
    }

    const jobIds = await addBulkJobs(
      jobType as JobType,
      req.userId,
      dataItems,
      {
        parentId,
        priority,
      }
    );

    return res.status(201).json({
      message: `Added ${jobIds.length} jobs successfully`,
      parentId: parentId || jobIds[0].split(":")[0],
      jobIds,
    });
  })
);

// Obtener estado de un job
apiRouter.get(
  "/jobs/:jobType/:jobId",
  customAsyncHandler(async (req, res) => {
    const { jobType, jobId } = req.params;

    if (!["basicBot", "chatBot", "engagementBot"].includes(jobType)) {
      return res.status(400).json({ error: "Invalid job type" });
    }

    const job = await getJob(jobType as JobType, req.userId, jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Obtener logs de manera efectiva
    const logs = job.data?.logs || [];
    
    // Obtener logs de salida capturada en caso de que existan (captureOutput: true)
    const outputLogs = await job.getChildrenValues();
    let combinedLogs = [...logs];
    
    // Procesar logs de salida capturada si existen
    if (outputLogs && outputLogs.length > 0) {
      // Los logs capturados desde console.log, etc.
      const capturedOutputLogs = outputLogs
        .filter((output: unknown) => output && typeof output === "string")
        .map((output: string) => ({
          timestamp: new Date().toISOString(),
          level: "info",
          message: output.trim(),
          source: "captured"
        }));
      
      combinedLogs = [...combinedLogs, ...capturedOutputLogs];
    }
    
    // Ordenar logs por timestamp
    combinedLogs.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return res.json({
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      data: job.data,
      timestamp: {
        created: job.timestamp
          ? new Date(Number(job.timestamp)).toISOString()
          : null,
        processed: job.processedOn
          ? new Date(Number(job.processedOn)).toISOString()
          : null,
        finished: job.finishedOn
          ? new Date(Number(job.finishedOn)).toISOString()
          : null,
      },
      returnvalue: job.returnvalue,
      logs: combinedLogs // Devuelve los logs mejorados
    });
  })
);

// Obtener logs de un job
apiRouter.get(
  "/jobs/:jobType/:jobId/logs",
  customAsyncHandler(async (req, res) => {
    const { jobType, jobId } = req.params;

    if (!["basicBot", "chatBot", "engagementBot"].includes(jobType)) {
      return res.status(400).json({ error: "Invalid job type" });
    }

    const job = await getJob(jobType as JobType, req.userId, jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Obtener logs de manera efectiva
    const logs = job.data?.logs || [];
    
    // Obtener logs de salida capturada
    const outputLogs = await job.getChildrenValues();
    let combinedLogs = [...logs];
    // Procesar logs de salida capturada si existen
    if (outputLogs && outputLogs.length > 0) {
      const capturedOutputLogs = outputLogs
        .filter((output: unknown) => output && typeof output === "string")
        .map((output: string) => ({
          timestamp: new Date().toISOString(),
          level: "info",
          message: output.trim(),
          source: "captured"
        }));
      
      combinedLogs = [...combinedLogs, ...capturedOutputLogs];
    }
    
    // Ordenar logs por timestamp
    combinedLogs.sort((a: { timestamp: string }, b: { timestamp: string }) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return res.json({
      jobId,
      count: combinedLogs.length,
      logs: combinedLogs
    });
  })
);

// Obtener jobs por parentId
apiRouter.get(
  "/jobs/:jobType/parent/:parentId",
  customAsyncHandler(async (req, res) => {
    const { jobType, parentId } = req.params;

    if (!["basicBot", "chatBot", "engagementBot"].includes(jobType)) {
      return res.status(400).json({ error: "Invalid job type" });
    }

    const jobs = await getJobsByParentId(
      jobType as JobType,
      req.userId,
      parentId
    );
    const jobDetails = await Promise.all(
      jobs.map(async (j) => ({
        id: j.id,
        state: await j.getState(),
        progress: j.progress,
        data: j.data,
        timestamp: {
          created: j.timestamp
            ? new Date(Number(j.timestamp)).toISOString()
            : null,
          processed: j.processedOn
            ? new Date(Number(j.processedOn)).toISOString()
            : null,
          finished: j.finishedOn
            ? new Date(Number(j.finishedOn)).toISOString()
            : null,
        },
      }))
    );

    return res.json({
      parentId,
      count: jobDetails.length,
      jobs: jobDetails,
    });
  })
);

// Montar /api
app.use("/api", apiRouter);

/**
 * Bull Board
 */
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
const bullMQAdapters: BullMQAdapter[] = [];

function createQueueAdapter(jobType: JobType, userId: string) {
  const q = getQueue(jobType, userId);
  const adapter = new BullMQAdapter(q);
  bullMQAdapters.push(adapter);
  return adapter;
}

createBullBoard({
  queues: bullMQAdapters,
  serverAdapter,
});

// Optional: proteger /admin/queues con auth - Corregido para evitar error TS2769
if (process.env.NODE_ENV === "production") {
  const adminAuthMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const adminKey = req.query.key || req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      res.status(403).send("Unauthorized");
      return;
    }
    next();
  };

  app.use("/admin/queues", adminAuthMiddleware);
}

app.use("/admin/queues", serverAdapter.getRouter());

// Servidor HTTP
let httpServer: http.Server | null = null;

/**
 * Inicia el servidor
 */
export async function startServer(port = 3000): Promise<http.Server> {
  // Crear el servidor HTTP
  httpServer = http.createServer(app);
  
  // Inicializar el servicio de WebSockets
  const io = initializeSocketService(httpServer);
  
  // Configurar el manejo de eventos para los sockets
  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    
    // Inicialización de workers por usuario
    socket.on("init-workers", (data: { concurrency?: number }) => {
      const concurrency = data.concurrency ?? 5;
      logger.info(`Inicializando workers para usuario ${userId}, concurrencia ${concurrency}`);
      
      // Crear workers para el usuario
      createBotWorkers(userId, concurrency);
      
      // Crear adaptadores BullMQ para visualización en Bull Board
      const jobTypes: JobType[] = ["basicBot", "chatBot", "engagementBot"];
      jobTypes.forEach((jt) => createQueueAdapter(jt, userId));
      
      // Confirmar inicialización
      socket.emit("workers-initialized", {
        status: "success",
        message: `Workers inicializados para usuario ${userId}`,
      });
    });
  });
  
  // Registrar listeners para todos los eventos de colas
  const jobEvents = [
    'job:added', 'job:started', 'job:progress', 'job:completed',
    'job:failed', 'job:error', 'job:log'
  ];
  
  // Configurar la emisión de eventos WebSocket para cada evento de job
  jobEvents.forEach(eventName => {
    queueEmitter.on(eventName, (jobInfo) => {
      emitJobEvent(eventName, jobInfo);
    });
  });
  
  // Iniciar el servidor HTTP
  return new Promise((resolve) => {
    httpServer!.listen(port, () => {
      logger.info(`API server escuchando en puerto ${port}`);
      resolve(httpServer!);
    });
  });
}

/**
 * Detiene el servidor si está en marcha
 */
export async function stopServer(): Promise<void> {
  // Cerrar el servicio de WebSockets
  closeSocketService();
  
  // Cerrar el servidor HTTP
  if (httpServer) {
    return new Promise((resolve, reject) => {
      httpServer!.close((err) => {
        if (err) {
          logger.error("Error al detener el servidor:", err);
          reject(err);
        } else {
          logger.info("Servidor detenido correctamente");
          resolve();
        }
      });
    });
  }
}

// Agregar tipado custom a Express
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// src/server/apiServer.ts
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketServer } from "socket.io";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { rateLimit } from "express-rate-limit";
import asyncHandler from "express-async-handler";
import {
  addJob,
  addBulkJobs,
  getJob,
  getJobsByParentId,
  getQueue,
  queueEmitter,
  JobType,
} from "../services/queueService.js";
import { createBotWorkers } from "../workers/botWorkers.js";
import logger from "../utils/logger.js";

declare module "bullmq" {
  interface Job<T = any, R = any, N extends string = string> {
    getLogs(): Promise<{ logs: string[] }>;
  }
}

// Crear aplicación Express
const app = express();

// Middleware de seguridad
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Límite por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});

app.use("/api", apiLimiter);

// Middleware para identificar usuario
// En una app real, esto usaría autenticación (JWT, etc.)
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Por simplicidad, usamos un header o un param para el userId
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
  }
);

// Configurar endpoints API
const apiRouter = express.Router();

// Endpoint de estado
apiRouter.get("/status", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    userId: req.userId,
  });
});

// Endpoint para añadir trabajo básico
apiRouter.post(
  "/jobs/basic",
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { message, sessionData, parentId, priority } = req.body;

    if (!sessionData) {
      return res.status(400).json({ error: "Session data is required" });
    }

    const jobId = await addJob(
      "basicBot",
      req.userId,
      {
        message,
        sessionData,
      },
      {
        parentId,
        priority,
      }
    );

    res.status(201).json({ jobId, message: "Job added successfully" });
  })
);

// Endpoint para añadir trabajo de chat
apiRouter.post(
  "/jobs/chat",
  asyncHandler(async (req: express.Request, res: express.Response) => {
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
      {
        messages,
        recipients,
        sessionData,
      },
      {
        parentId,
        priority,
      }
    );

    res.status(201).json({ jobId, message: "Chat job added successfully" });
  })
);

// Endpoint para añadir trabajo de engagement
apiRouter.post(
  "/jobs/engagement",
  asyncHandler(async (req: express.Request, res: express.Response) => {
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
      {
        parentId,
        priority,
      }
    );

    res
      .status(201)
      .json({ jobId, message: "Engagement job added successfully" });
  })
);

// Endpoint para añadir múltiples trabajos del mismo tipo
apiRouter.post(
  "/jobs/bulk/:jobType",
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { jobType } = req.params;
    const { dataItems, parentId, priority } = req.body;

    if (!dataItems || !Array.isArray(dataItems) || dataItems.length === 0) {
      return res.status(400).json({ error: "dataItems array is required" });
    }

    // Validar tipo de trabajo
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

    res.status(201).json({
      message: `Added ${jobIds.length} jobs successfully`,
      parentId: parentId || jobIds[0].split(":")[0],
      jobIds,
    });
  })
);

// Obtener estado de un trabajo
apiRouter.get(
  "/jobs/:jobType/:jobId",
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { jobType, jobId } = req.params;

    // Validar tipo de trabajo
    if (!["basicBot", "chatBot", "engagementBot"].includes(jobType)) {
      return res.status(400).json({ error: "Invalid job type" });
    }

    const job = await getJob(jobType as JobType, req.userId, jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const logs = await job.getLogs();

    res.json({
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      data: job.data,
      timestamp: {
        created: new Date(Number(job.timestamp)).toISOString(),
        processed: job.processedOn
          ? new Date(Number(job.processedOn)).toISOString()
          : null,
        finished: job.finishedOn
          ? new Date(Number(job.finishedOn)).toISOString()
          : null,
      },
      returnvalue: job.returnvalue,
      logs: logs ? logs.logs : [],
    });
  })
);

// Obtener trabajos por parentId
apiRouter.get(
  "/jobs/:jobType/parent/:parentId",
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { jobType, parentId } = req.params;

    // Validar tipo de trabajo
    if (!["basicBot", "chatBot", "engagementBot"].includes(jobType)) {
      return res.status(400).json({ error: "Invalid job type" });
    }

    const jobs = await getJobsByParentId(
      jobType as JobType,
      req.userId,
      parentId
    );

    const jobDetails = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        state: await job.getState(),
        progress: job.progress,
        data: job.data,
        timestamp: {
          created: new Date(Number(job.timestamp)).toISOString(),
          processed: job.processedOn
            ? new Date(Number(job.processedOn)).toISOString()
            : null,
          finished: job.finishedOn
            ? new Date(Number(job.finishedOn)).toISOString()
            : null,
        },
      }))
    );

    res.json({
      parentId,
      count: jobDetails.length,
      jobs: jobDetails,
    });
  })
);

// Añadir router API a la aplicación
app.use("/api", apiRouter);

// Configurar Bull Board (panel de monitoreo)
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

// Colección para almacenar adaptadores de BullMQ
const bullMQAdapters: BullMQAdapter[] = [];

// Función para crear adaptadores de BullMQ dinámicamente
function createQueueAdapter(jobType: JobType, userId: string) {
  const queue = getQueue(jobType, userId);
  const adapter = new BullMQAdapter(queue);
  bullMQAdapters.push(adapter);
  return adapter;
}

// Crear Bull Board con adaptadores iniciales
createBullBoard({
  queues: bullMQAdapters,
  serverAdapter
});

// Middleware de autenticación para Bull Board en producción
if (process.env.NODE_ENV === 'production') {
  const adminAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const adminKey = req.query.key || req.headers['x-admin-key'];
    
    if (adminKey !== process.env.ADMIN_API_KEY) {
      res.status(403).send('Unauthorized');
      return;
    }
    
    next();
  };
}

// Montar Bull Board
app.use("/admin/queues", serverAdapter.getRouter());

// Inicializar servidor HTTP y Socket.io
let httpServer: http.Server;
let io: SocketServer;

/**
 * Inicia el servidor API
 */
export async function startServer(port: number = 3000): Promise<http.Server> {
  // Crear servidor HTTP
  httpServer = http.createServer(app);

  // Configurar Socket.io
  io = new SocketServer(httpServer, {
    cors: {
      origin: "*", // En producción, configurar origen específico
      methods: ["GET", "POST"],
    },
  });

  // Configurar middleware de Socket.io
  io.use((socket, next) => {
    const userId =
      socket.handshake.auth.userId || (socket.handshake.query.userId as string);

    if (!userId) {
      return next(new Error("User ID is required"));
    }

    socket.data.userId = userId;
    next();
  });

  // Manejar conexiones Socket.io
  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    logger.info(`Socket connected: ${socket.id} for user ${userId}`);

    // Unirse a sala específica para este usuario
    socket.join(`user:${userId}`);

    // Event listener para inicializar workers
    socket.on("init-workers", (data: { concurrency?: number }) => {
      const concurrency = data.concurrency || 5;
      logger.info(
        `Initializing workers for user ${userId} with concurrency ${concurrency}`
      );
      createBotWorkers(userId, concurrency);

      // Crear adaptadores de cola para BullBoard
      const queues = ["basicBot", "chatBot", "engagementBot"].map((jobType) =>
        createQueueAdapter(jobType as JobType, userId)
      );

      socket.emit("workers-initialized", {
        status: "success",
        message: `Workers initialized for user ${userId} with concurrency ${concurrency}`,
      });
    });

    // Event listener para monitoreo de trabajos
    socket.on("monitor-job", (data: { jobId: string; jobType: string }) => {
      const { jobId, jobType } = data;
      logger.debug(`User ${userId} monitoring job ${jobId} of type ${jobType}`);

      // Unirse a sala específica para este trabajo
      socket.join(`job:${jobId}`);
    });

    // Event listener para desconexión
    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // Configurar eventos de cola para reenviar a clientes vía Socket.io
  queueEmitter.on("job:added", (jobInfo) => {
    io.to(`user:${jobInfo.userId}`).emit("job:added", jobInfo);
  });

  queueEmitter.on("job:started", (jobInfo) => {
    io.to(`user:${jobInfo.userId}`)
      .to(`job:${jobInfo.jobId}`)
      .emit("job:started", jobInfo);
  });

  queueEmitter.on("job:progress", (jobInfo) => {
    io.to(`user:${jobInfo.userId}`)
      .to(`job:${jobInfo.jobId}`)
      .emit("job:progress", jobInfo);
  });

  queueEmitter.on("job:completed", (jobInfo) => {
    io.to(`user:${jobInfo.userId}`)
      .to(`job:${jobInfo.jobId}`)
      .emit("job:completed", jobInfo);
  });

  queueEmitter.on("job:failed", (jobInfo) => {
    io.to(`user:${jobInfo.userId}`)
      .to(`job:${jobInfo.jobId}`)
      .emit("job:failed", jobInfo);
  });

  queueEmitter.on("job:error", (jobInfo) => {
    io.to(`user:${jobInfo.userId}`)
      .to(`job:${jobInfo.jobId}`)
      .emit("job:error", jobInfo);
  });

  // Iniciar servidor HTTP
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
      resolve(httpServer);
    });
  });
}

/**
 * Detiene el servidor API
 */
export async function stopServer(): Promise<void> {
  if (httpServer) {
    return new Promise((resolve, reject) => {
      httpServer.close((err) => {
        if (err) {
          logger.error("Error stopping server:", err);
          reject(err);
        } else {
          logger.info("Server stopped");
          resolve();
        }
      });
    });
  }
}

// Añadir tipos para express
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export default {
  startServer,
  stopServer,
  app,
  getHttpServer: () => httpServer,
  getIo: () => io,
};

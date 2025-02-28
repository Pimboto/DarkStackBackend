// examples/client-usage.js
// Este archivo muestra cómo usar la API desde un cliente externo

// Ejemplo usando fetch API
async function executeBasicBot() {
  const sessionData = {
    did: "did:plc:afc44uvxzyjg5kssx2us7ed3",
    handle: "pimboto.bsky.social",
    email: "pimbotoo@gmail.com",
    accessJwt: "your_access_jwt_here",
    refreshJwt: "your_refresh_jwt_here"
  };

  const response = await fetch('http://localhost:3000/api/jobs/basic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user123' // Identificador del usuario
    },
    body: JSON.stringify({
      sessionData,
      message: '¡Hola desde la API BullMQ! 🤖',
      parentId: 'workflow123' // Opcional, para agrupar trabajos
    })
  });

  const data = await response.json();
  console.log('Job created:', data);
  return data.jobId;
}

// Ejemplo usando WebSocket para monitoreo en tiempo real
function monitorJobProgress(jobId, jobType = 'basicBot') {
  return new Promise((resolve, reject) => {
    // Crear conexión WebSocket
    const socket = new WebSocket('ws://localhost:3000');
    
    socket.onopen = () => {
      console.log('WebSocket connected');
      
      // Autenticar
      socket.send(JSON.stringify({
        type: 'auth',
        userId: 'user123'
      }));
      
      // Solicitar monitoreo del trabajo
      socket.send(JSON.stringify({
        type: 'monitor-job',
        jobId,
        jobType
      }));
    };
    
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'job:progress':
          console.log(`Progress: ${message.progress}%`);
          break;
        
        case 'job:completed':
          console.log('Job completed successfully:', message.result);
          socket.close();
          resolve(message.result);
          break;
        
        case 'job:failed':
          console.error('Job failed:', message.error);
          socket.close();
          reject(new Error(message.error));
          break;
          
        case 'job:log':
          console.log(`Job log: ${message.message}`);
          break;
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    };
    
    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };
  });
}

// Ejemplo completo: crear trabajo y monitorear progreso
async function runCompleteExample() {
  try {
    // Crear trabajo
    const jobId = await executeBasicBot();
    console.log(`Job created with ID: ${jobId}`);
    
    // Monitorear progreso
    console.log('Monitoring job progress...');
    const result = await monitorJobProgress(jobId);
    
    console.log('Final result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

// runCompleteExample();

// Ejemplo de uso de la API para tareas de engagement
async function executeEngagementBot() {
  const sessionData = {
    did: "did:plc:afc44uvxzyjg5kssx2us7ed3",
    handle: "pimboto.bsky.social",
    email: "pimbotoo@gmail.com",
    accessJwt: "your_access_jwt_here",
    refreshJwt: "your_refresh_jwt_here"
  };

  const engagementOptions = {
    numberOfActions: 20,
    delayRange: [5, 15],
    skipRange: [0, 2],
    likePercentage: 80
  };

  const response = await fetch('http://localhost:3000/api/jobs/engagement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user123'
    },
    body: JSON.stringify({
      sessionData,
      engagementOptions,
      strategyType: 'human-like',
      parentId: 'dailyEngagement123'
    })
  });

  const data = await response.json();
  console.log('Engagement job created:', data);
  return data.jobId;
}

// Ejemplo de uso de la API para tareas de chat
async function executeChatBot() {
  const sessionData = {
    did: "did:plc:afc44uvxzyjg5kssx2us7ed3",
    handle: "pimboto.bsky.social",
    email: "pimbotoo@gmail.com",
    accessJwt: "your_access_jwt_here",
    refreshJwt: "your_refresh_jwt_here"
  };

  const messages = [
    "¡Hola! Gracias por seguirme, estoy para ayudarte con cualquier duda.",
    "Estoy trabajando en un proyecto interesante, ¿te gustaría saber más?"
  ];

  const recipients = [
    "usuario1.bsky.social",
    "usuario2.bsky.social",
    "usuario3.bsky.social"
  ];

  const response = await fetch('http://localhost:3000/api/jobs/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user123'
    },
    body: JSON.stringify({
      sessionData,
      messages,
      recipients,
      parentId: 'welcomeMessages123'
    })
  });

  const data = await response.json();
  console.log('Chat job created:', data);
  return data.jobId;
}

// Ejemplo para crear múltiples trabajos de engagement de una vez
async function createBulkEngagementJobs() {
  const accountSessions = [
    {
      name: 'Account 1',
      sessionData: { /* Datos de sesión para cuenta 1 */ }
    },
    {
      name: 'Account 2',
      sessionData: { /* Datos de sesión para cuenta 2 */ }
    },
    {
      name: 'Account 3',
      sessionData: { /* Datos de sesión para cuenta 3 */ }
    }
  ];

  const dataItems = accountSessions.map(account => ({
    sessionData: account.sessionData,
    engagementOptions: {
      numberOfActions: 15,
      delayRange: [5, 20],
      skipRange: [0, 3],
      likePercentage: 75
    },
    strategyType: 'human-like',
    accountName: account.name
  }));

  const response = await fetch('http://localhost:3000/api/jobs/bulk/engagementBot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user123'
    },
    body: JSON.stringify({
      dataItems,
      parentId: 'bulkEngagement123'
    })
  });

  const data = await response.json();
  console.log('Bulk engagement jobs created:', data);
  return data;
}

// Ejemplo para consultar el estado de trabajos agrupados por parentId
async function checkJobsByParentId(parentId, jobType = 'engagementBot') {
  const response = await fetch(`http://localhost:3000/api/jobs/${jobType}/parent/${parentId}`, {
    headers: {
      'x-user-id': 'user123'
    }
  });

  const data = await response.json();
  console.log(`Jobs for parent ${parentId}:`, data);
  
  // Calcular estadísticas
  const states = data.jobs.reduce((acc, job) => {
    acc[job.state] = (acc[job.state] || 0) + 1;
    return acc;
  }, {});
  
  console.log('Job states:', states);
  
  return data;
}

// Exportar funciones para uso desde node
module.exports = {
  executeBasicBot,
  monitorJobProgress,
  runCompleteExample,
  executeEngagementBot,
  executeChatBot,
  createBulkEngagementJobs,
  checkJobsByParentId
};

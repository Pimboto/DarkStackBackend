// Este es un ejemplo simple de cómo conectarse al WebSocket para un job de massPost
// Puedes usar este archivo en un proyecto React o adaptarlo para JavaScript puro

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// Componente para monitorear jobs de massPost
function MassPostMonitor() {
  // Estado para almacenar la información del job
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [jobData, setJobData] = useState({});
  const [jobLogs, setJobLogs] = useState([]);
  
  // Sustituye estos valores con tus datos reales
  const SERVER_URL = 'http://localhost:3000'; // URL de tu servidor
  const USER_ID = 'tu-user-id'; // ID del usuario que creó el job
  const JOB_ID = 'job-id-a-monitorear'; // ID del job de massPost que quieres monitorear
  
  useEffect(() => {
    // Crear la conexión Socket.IO
    const newSocket = io(SERVER_URL, {
      // Autenticación - IMPORTANTE: el userId es obligatorio
      auth: { userId: USER_ID }
    });
    
    // Manejar eventos de conexión
    newSocket.on('connect', () => {
      console.log('¡Conectado al WebSocket!');
      setConnected(true);
      
      // Una vez conectado, monitorear el job específico de massPost
      newSocket.emit('monitor-job', { 
        jobId: JOB_ID,
        jobType: 'massPostBot' // Tipo de job que quieres monitorear
      });
      
      console.log(`Monitoreando job: ${JOB_ID}`);
    });
    
    // Manejar desconexión
    newSocket.on('disconnect', () => {
      console.log('Desconectado del WebSocket');
      setConnected(false);
    });
    
    // Error de conexión
    newSocket.on('connect_error', (error) => {
      console.error('Error de conexión:', error.message);
    });
    
    // Suscribirse a eventos de job
    
    // Evento de inicio de job
    newSocket.on('job:started', (data) => {
      console.log('Job iniciado:', data);
      if (data.jobId === JOB_ID) {
        setJobData(prevData => ({
          ...prevData,
          status: 'active',
          startTime: new Date().toISOString()
        }));
      }
    });
    
    // Evento de progreso
    newSocket.on('job:progress', (data) => {
      console.log('Progreso del job:', data);
      if (data.jobId === JOB_ID) {
        setJobData(prevData => ({
          ...prevData,
          progress: data.progress
        }));
      }
    });
    
    // Evento de log
    newSocket.on('job:log', (data) => {
      console.log('Nuevo log:', data);
      if (data.jobId === JOB_ID && data.log) {
        setJobLogs(prevLogs => [...prevLogs, data.log]);
      }
    });
    
    // Evento de finalización exitosa
    newSocket.on('job:completed', (data) => {
      console.log('Job completado:', data);
      if (data.jobId === JOB_ID) {
        setJobData(prevData => ({
          ...prevData,
          status: 'completed',
          result: data.result,
          endTime: new Date().toISOString()
        }));
      }
    });
    
    // Evento de error
    newSocket.on('job:failed', (data) => {
      console.log('Job fallido:', data);
      if (data.jobId === JOB_ID) {
        setJobData(prevData => ({
          ...prevData,
          status: 'failed',
          error: data.error,
          endTime: new Date().toISOString()
        }));
      }
    });
    
    setSocket(newSocket);
    
    // Limpieza al desmontar
    return () => {
      if (newSocket) {
        // Dejar de monitorear el job
        newSocket.emit('unmonitor-job', { jobId: JOB_ID });
        // Desconectar socket
        newSocket.disconnect();
      }
    };
  }, []);
  
  // Función para dejar de monitorear manualmente
  const stopMonitoring = () => {
    if (socket && connected) {
      socket.emit('unmonitor-job', { jobId: JOB_ID });
      console.log(`Dejando de monitorear job: ${JOB_ID}`);
    }
  };
  
  return (
    <div>
      <h1>Monitor de Job de MassPost</h1>
      
      {/* Estado de conexión */}
      <div style={{ 
        backgroundColor: connected ? 'green' : 'red',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        marginBottom: '20px'
      }}>
        Estado: {connected ? 'Conectado' : 'Desconectado'}
      </div>
      
      {/* Información del job */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Información del Job</h2>
        <p>ID: {JOB_ID}</p>
        <p>Estado: {jobData.status || 'Esperando...'}</p>
        
        {jobData.progress !== undefined && (
          <div>
            <p>Progreso: {jobData.progress}%</p>
            <div style={{ 
              height: '20px',
              width: '100%',
              backgroundColor: '#e0e0e0',
              borderRadius: '5px'
            }}>
              <div style={{
                height: '100%',
                width: `${jobData.progress}%`,
                backgroundColor: 'blue',
                borderRadius: '5px'
              }}></div>
            </div>
          </div>
        )}
        
        {jobData.error && (
          <div style={{ color: 'red' }}>
            <p>Error: {jobData.error}</p>
          </div>
        )}
        
        {jobData.result && (
          <div>
            <h3>Resultado:</h3>
            <pre>{JSON.stringify(jobData.result, null, 2)}</pre>
          </div>
        )}
      </div>
      
      {/* Logs del job */}
      <div>
        <h2>Logs ({jobLogs.length})</h2>
        <div style={{ 
          height: '300px', 
          overflowY: 'scroll',
          border: '1px solid #ccc',
          padding: '10px',
          borderRadius: '5px',
          backgroundColor: '#f5f5f5'
        }}>
          {jobLogs.map((log, index) => (
            <div key={index} style={{
              marginBottom: '5px',
              padding: '5px',
              borderRadius: '3px',
              backgroundColor: log.level === 'error' ? '#ffebee' : 
                            log.level === 'warn' ? '#fff8e1' : 
                            log.level === 'debug' ? '#e8f5e9' : '#e3f2fd'
            }}>
              <span style={{ color: '#555', marginRight: '10px' }}>
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span style={{ 
                fontWeight: 'bold',
                color: log.level === 'error' ? 'red' : 
                      log.level === 'warn' ? 'orange' : 
                      log.level === 'debug' ? 'green' : 'blue'
              }}>
                [{log.level}]
              </span>
              <span style={{ marginLeft: '10px' }}>{log.message}</span>
            </div>
          ))}
          
          {jobLogs.length === 0 && (
            <p style={{ color: '#999', textAlign: 'center', marginTop: '20px' }}>
              No hay logs disponibles
            </p>
          )}
        </div>
      </div>
      
      {/* Botón para dejar de monitorear */}
      <button 
        onClick={stopMonitoring}
        style={{
          marginTop: '20px',
          padding: '10px 20px',
          backgroundColor: 'red',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        Dejar de monitorear
      </button>
    </div>
  );
}

export default MassPostMonitor;

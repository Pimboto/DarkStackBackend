// src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Darkstack Backend API',
      version: '1.0.0',
      description: 'API documentation for Darkstack Backend service',
      contact: {
        name: 'API Support'
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        userId: {
          type: 'apiKey',
          in: 'header',
          name: 'x-user-id',
          description: 'User ID for authentication'
        },
        adminKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-admin-key',
          description: 'Admin key for accessing protected routes'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            message: {
              type: 'string',
              description: 'Detailed error message'
            }
          }
        },
        Job: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Job ID'
            },
            state: {
              type: 'string',
              enum: ['waiting', 'active', 'completed', 'failed'],
              description: 'Current state of the job'
            },
            progress: {
              type: 'number',
              description: 'Job progress percentage'
            },
            data: {
              type: 'object',
              description: 'Job data'
            },
            timestamp: {
              type: 'object',
              properties: {
                created: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Job creation timestamp'
                },
                processed: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Job processing start timestamp'
                },
                finished: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Job completion timestamp'
                }
              }
            },
            returnvalue: {
              type: 'object',
              description: 'Job return value'
            }
          }
        },
        JobLog: {
          type: 'object',
          properties: {
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Log entry timestamp'
            },
            level: {
              type: 'string',
              enum: ['info', 'error', 'debug', 'warn'],
              description: 'Log level'
            },
            message: {
              type: 'string',
              description: 'Log message'
            },
            source: {
              type: 'string',
              description: 'Log source'
            }
          }
        }
      }
    }
  },
  apis: ['./src/server/*.ts'], // Path to the API routes
};

export const specs = swaggerJsdoc(options);
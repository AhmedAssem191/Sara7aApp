import { createClient } from "redis";
import { REDIS_URI } from "../../config/config.service.js";





export const redisClient = createClient({
  url: REDIS_URI,
});
redisClient.on('error', error => console.error('Redis connection error:', error.code || error.name));

export const conenctRedis = async () => {
  try {
    await redisClient.connect();
    console.log("Connected to Redis successfully");
  } catch (error) {
    console.error("Error connecting to Redis:", error);
  }
};

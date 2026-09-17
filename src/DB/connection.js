import mongoose from "mongoose";
import { DB_URI } from "../../config/config.service.js";

const connectDB = async () => {
  try {
    mongoose.connection.on("connected", () => {
      console.log("MONGODB connected successfuly");
    });

    // Ensure connection errors don't crash silently and we can confirm success/failure.
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Mongoose connected");
  } catch (error) {
    console.log("ERROR IN DATABASE", error);
    // Re-throw so server can stop instead of appearing 'running' but not listening.
    throw error;
  }
};


export default connectDB;

import { WHITE_LIST } from "../../../config/config.service.js";
import { BadRequestException } from "../response/error.response.js";

export function corsOptions() {
  const whiteList = WHITE_LIST.split(",").map(value => value.trim()).filter(Boolean);
  const corsOptions = {
    origin: function (origin, callback) {
      if (whiteList.includes(origin)) {
        callback(null, true);
      } else if (!origin) {
        callback(null, true);
      } else {
        callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
      }
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
  };

  return corsOptions;
}

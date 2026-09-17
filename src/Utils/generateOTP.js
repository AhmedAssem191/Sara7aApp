import { customAlphabet } from "nanoid";

export function generateOTP (){
    return customAlphabet("0123456789", 6)();
}
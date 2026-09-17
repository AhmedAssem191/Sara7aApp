import { hash, compare } from "bcrypt";
import * as argon2 from "argon2";
import { SALT } from "../../../config/config.service.js";
import { HashEnum } from "../enum/secutity.enum.js";

export const generateHash = async ({
  plaintext,
  salt = SALT,
  algo = HashEnum.bycrypt,
}) => {
  let hashResult = "";

  switch (algo) {
    case HashEnum.bycrypt:
      hashResult = await hash(plaintext, salt);
      break;

    case HashEnum.argon2:
      hashResult = await argon2.hash(plaintext);
      break;
    default:
      hashResult = await hash(plaintext, salt);
      break;
  }
  return hashResult;
};

export const compareHash = async ({
  plaintext,
  ciphertext,
  algo = HashEnum.bycrypt,
}) => {
  let match = false;

  switch (algo) {
    case HashEnum.bycrypt:
      match = await compare(plaintext, ciphertext);
      break;

    case HashEnum.argon2:
      match = await argon2.verify(ciphertext, plaintext);
      break;
    default:
      match = await compare(plaintext, ciphertext);
      break;
  }
  return match;
};

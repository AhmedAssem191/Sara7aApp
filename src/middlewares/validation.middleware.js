import Joi from 'joi';
import { BadRequestException } from '../Utils/response/error.response.js';
const name = Joi.string().trim().pattern(/^[\p{L}\p{M}][\p{L}\p{M}\s'’-]*$/u).min(1).max(50);
export const generalFields = {
  firstName: name, lastName: name,
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254),
  age: Joi.number().integer().min(1).max(120),
  phone: Joi.string().trim().pattern(/^(?:\+20|020|0)?1[0125][0-9]{8}$/),
  password: Joi.string().min(12).max(128),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  id: Joi.string().hex().length(24),
  otp: Joi.string().pattern(/^[0-9]{6}$/),
};
export const pagination = {
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
};
export const validation = schema => (req, res, next) => {
  req.validated ||= {};
  const errors = [];
  for (const [key, rule] of Object.entries(schema)) {
    const { value, error } = rule.validate(req[key], { abortEarly: false });
    if (error) errors.push(...error.details.map(d => ({ field: [key, ...d.path].join('.'), message: d.message })));
    else { req.validated[key] = value; if (key === 'body') req.body = value; }
  }
  if (errors.length) BadRequestException('Validation failed', errors);
  next();
};

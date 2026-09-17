import Joi from 'joi';
import { generalFields as f, pagination } from '../../middlewares/validation.middleware.js';
const params = Joi.object({ messageId: f.id.required() });
export const sendMessageValidation = {
  params: Joi.object({ receiverId: f.id.required() }),
  body: Joi.object({ content: Joi.string().trim().min(2).max(500).required(), captchaToken: Joi.string().max(5000) }).required(),
};
export const listValidation = {
  params: Joi.object({ receiverId: f.id }),
  query: Joi.object({ ...pagination, read: Joi.boolean(), favorite: Joi.boolean(), search: Joi.string().trim().max(100) }).default(),
};
export const messageValidation = { params };
export const updateValidation = { params, body: Joi.object({ read: Joi.boolean(), favorite: Joi.boolean(), published: Joi.boolean() }).min(1).required() };
export const reportValidation = { params, body: Joi.object({ reason: Joi.string().trim().min(3).max(500).required() }).required() };
export const reportListValidation = { query: Joi.object({ ...pagination, status: Joi.string().valid('open', 'resolved', 'dismissed') }).default() };
export const resolveValidation = { params: Joi.object({ reportId: f.id.required() }), body: Joi.object({ status: Joi.string().valid('resolved', 'dismissed').required() }).required() };
export const publicListValidation = { params: Joi.object({ receiverId: f.id.required() }), query: Joi.object(pagination).default() };
export const shareValidation = { params: Joi.object({ shareId: Joi.string().hex().length(48).required() }) };

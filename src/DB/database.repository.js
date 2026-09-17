



export const findOne = async ({
  model,
  select = "",
  filter = {},
  option = {},
}) => {
  const doc = model.findOne(filter);
  if (select?.length) {
    doc.select(select);
  }

  if (option?.populate) {
    doc.populate(option.populate);
  }

  if (option?.lean) {
    doc.lean();
  }
  return await doc.exec();
};
export const findById = async ({ model, select = "", id, option = {} }) => {
  const doc = model.findById(id);
  if (select?.length) {
    doc.select(select);
  }

  if (option?.populate) {
    doc.populate(option.populate);
  }

  if (option?.lean) {
    doc.lean();
  }
  return await doc.exec();
};
export const find = async ({
  model,
  select = "",
  filter = {},
  option = {},
}) => {
  const doc = model.find(filter);
  if (select?.length) {
    doc.select(select);
  }

  if (option?.populate) {
    doc.populate(option.populate);
  }

  if (option?.lean) {
    doc.lean();
  }
  return await doc.exec();
};
export const insertMany = async ({ model, data }) => {
  return await model.insertMany(data);
};


export const create = async ({
  model,
  data,
  option = { validateBeforeSave: true },
}) => {
  const [doc] = (await model.create(data, option)) || [];
  return doc;
};

export const updateOne = async ({
  model,
  filter = {},
  update,
  option = {},
}) => {
  return await model.updateOne(filter, { ...update, $inc: { ...update.$inc, __v: 1 } }, { runValidators: true, ...option });
};

export const findOneAndUpdate = async ({
  model,
  filter = {},
  update,
  option,
}) => {
  return await model.findOneAndUpdate(
    filter,
    { ...update, $inc: { ...update.$inc, __v: 1 } },
    {
      returnDocument: 'after',
      runValidators: true,
      ...option,
    },
  );
};

export const findByIdAndUpdate = async ({ model, id = "", update, option }) => {
  return await model.findByIdAndUpdate(
    id,
    { ...update, $inc: { ...update.$inc, __v: 1 } },
    { returnDocument: 'after', runValidators: true, ...option },
  );
};
export const deleteOne = async ({ model, filter = {} }) => {
  return await model.deleteOne(filter);
};

export const deleteMany = async ({ model, filter = {} }) => {
  return await model.deleteMany(filter);
};

export const findOneAndDelete = async ({ model, filter = {} }) => {
  return await model.findOneAndDelete(filter);
};

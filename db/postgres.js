const { Client } = require("pg");
const format = require("pg-format");
const { dbConfig } = require("./config/dbConfig");

const client = new Client(dbConfig);

const startClientConnection = async () => {
  try {
    return await client.connect();
  } catch (error) {
    console.log(error);
  }
};

const stopClientConnection = async () => {
  try {
    return await client.end();
  } catch (error) {
    console.log(error);
  }
};

const selectStatement = async (statement) => {
  try {
    const res = await client.query(statement);
    return res?.rows;
  } catch (error) {
    console.log(statement);
    console.log(error);
  }
};

const sqlInsertStatement = async (statement) => {
  try {
    console.log(statement);
    const res = await client.query(statement);
  } catch (error) {
    console.log(statement);
    console.log(error);
  }
};

const sqlInsertStatementWithFormat = async (statement, values) => {
  try {
    console.log(statement);
    const res = await client.query(format(statement, values));
  } catch (error) {
    console.error(error);
  }
};

exports.sqlInsertStatementWithFormat = sqlInsertStatementWithFormat;
exports.sqlInsertStatement = sqlInsertStatement;
exports.startClientConnection = startClientConnection;
exports.stopClientConnection = stopClientConnection;
exports.selectStatement = selectStatement;

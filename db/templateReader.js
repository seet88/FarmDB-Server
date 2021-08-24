const csv = require("csv-parser");
const fs = require("fs");
const {
  sqlInsertStatementWithFormat,
  sqlInsertStatement,
  stopClientConnection,
  startClientConnection,
  selectStatement,
} = require("./postgres");
const {
  getLibrariesTemplates,
  getLibrariesTemplatesColumnsForPostgres,
  getLibrariesTemplatesForPostgres,
} = require("./sqlLite");
const {
  prepareColumnName,
  getSqlCreateTableStatement,
  getLibrariesDataForInsert,
  parseFieldType,
  createInsertQuery,
  createInsertLinksEntries,
  createInsertColumnsTemplates,
  createInsertLibrariesTemplates,
} = require("./dbHelpers");
/*
SQLlite
*/

const { librariesTemplates, librariesData } = getLibrariesTemplates();

/*
data csv
*/

const getLibrariesTemplatesFromCSV = async (file) =>
  new Promise((resolve, reject) => {
    let librariesTemplatesGS = [];
    let libraryColumns = [];
    let prevKey = "";
    let initVal = true;
    fs.createReadStream(file)
      .pipe(csv())
      .on("data", (row) => {
        let gsKey = row["Klucz"];
        if (prevKey !== gsKey && !initVal) {
          librariesTemplatesGS.push([...libraryColumns]);
          libraryColumns = [];

          libraryColumns.push({
            sqlTableName: row["Nazwa Tabeli MSSQL"],
            gsKey,
            gsName: row["Nazwa GS"],
            fieldSize: null,
            gsFieldName: "mementoOldId",
            sqlFieldName: "mementoOldId",
            fieldType: "varchar(100)",
          });
        }
        initVal = false;
        libraryColumns.push({
          sqlTableName: row["Nazwa Tabeli MSSQL"],
          gsKey,
          gsName: row["Nazwa GS"],
          fieldSize: row["Rozmiar pola"],
          gsFieldName: prepareColumnName(row["Pole w GS"]),
          sqlFieldName: prepareColumnName(row["Pole w MSSQL"]),
          fieldType: parseFieldType(row.TypPola),
        });
        prevKey = gsKey;
      })
      .on("end", () => {
        librariesTemplatesGS.push([...libraryColumns]);
        console.log("CSV file successfully processed");
        resolve(librariesTemplatesGS);
      });
  });

const startImportDataFromSQLliteToPostgres = async () => {
  const librariesTemplatesGS = await getLibrariesTemplatesFromCSV(
    "template.csv"
  );
  const sqlCreateTableStm = getSqlCreateTableStatement(
    librariesTemplatesGS,
    librariesTemplates
  );

  await startClientConnection();
  const executeCreateTableStatements = async () => {
    return Promise.all(
      sqlCreateTableStm.map(async (tableStm) => {
        const result = await sqlInsertStatement(tableStm);
      })
    );
  };
  //create tables
  //   await executeCreateTableStatements();
  const libsDataForImport = getLibrariesDataForInsert(
    librariesTemplatesGS,
    librariesTemplates,
    librariesData
  );
  const executeInsertValuesStatement = async () => {
    return Promise.all(
      libsDataForImport.map(async (libData) => {
        // if (String(libData.libName).toLowerCase() === "tankowanie_prod") {
        const { statement, values, linksToEntries } = createInsertQuery(
          libData,
          librariesTemplates,
          librariesTemplatesGS
        );
        await sqlInsertStatementWithFormat(statement, values);
        const { linksValues, linksStatements } =
          createInsertLinksEntries(linksToEntries);
        await sqlInsertStatementWithFormat(linksStatements, linksValues);
        // }
      })
    );
  };

  await executeInsertValuesStatement();

  await stopClientConnection();
};

// startImportDataFromSQLliteToPostgres();

const getRowsFromDB = async () => {
  const stm = `  
  select l.nazwa_skladnika_1 as sss, 
 json_build_object('value', l.nazwa_skladnika_1,
'entrylinks' ,array( select json_build_object( 'rowUUID', el.mementoOldId, 'tableName', el.tableName,
									 'columnParentName', el.columnParentName,
									 'libUUID', ( select uuid from libraries_templates where sql_table_name = el.tableName)
									) 
		   from entrylinksrelations el where el.uuid::varchar(100) = l.nazwa_skladnika_1
		  ) 
 ) as nazwa_skladnika_1
 from SoR_Mieszaniny_2018_PROD l
`;
  await startClientConnection();
  const rows = await selectStatement(stm);
  console.log(rows[43]);
  await stopClientConnection();
};

// getRowsFromDB();

const importLibrariesTemplates = async () => {
  const librariesTemplates = getLibrariesTemplatesForPostgres();
  const librariesTemplatesGS = await getLibrariesTemplatesFromCSV(
    "template.csv"
  );

  librariesTemplates.map((lib) => {
    //libraries
    const foundLibGS = librariesTemplatesGS.find(
      (libGS) => libGS[0].gsKey === lib.googleDocId
    );
    if (foundLibGS) lib.sqlTableName = foundLibGS[0].sqlTableName;
    else lib.sqlTableName = "NoTable";
  });

  const { librariesValues, statement: stmLibraries } =
    createInsertLibrariesTemplates(librariesTemplates);
  await startClientConnection();
  await sqlInsertStatementWithFormat(stmLibraries, librariesValues);

  //columns
  const columnsTemplates = getLibrariesTemplatesColumnsForPostgres();
  columnsTemplates.map((column) => {
    let sqlFieldName;
    let sql_field_type;
    const gsLibFound = librariesTemplatesGS.find((gsLib) =>
      gsLib.find(
        (col) =>
          String(col.gsKey).toLowerCase() ===
          String(column?.googleDocId).toLowerCase()
      )
    );
    if (gsLibFound) {
      const gsCol = gsLibFound?.find(
        (col) =>
          String(col.gsFieldName).toLowerCase() ===
          String(column?.name).toLowerCase()
      );
      sqlFieldName = gsCol?.sqlFieldName;
      sql_field_type = gsCol?.fieldType;
    }
    column.sqlFieldName = sqlFieldName;
    column.sql_field_type = sql_field_type;
  });
  const { columnsValues, statement } =
    createInsertColumnsTemplates(columnsTemplates);
  console.log("before sqlInsertStatementWithFormat");
  await sqlInsertStatementWithFormat(statement, columnsValues);

  await stopClientConnection();
};

importLibrariesTemplates();

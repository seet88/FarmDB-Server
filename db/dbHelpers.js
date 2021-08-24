const findTableName = (libUUID, librariesTemplates, librariesTemplatesGS) => {
  const googleDocId = librariesTemplates.find(
    (lib) => lib.libUUID === libUUID
  )?.googleDocId;
  if (!librariesTemplatesGS.find((lib) => lib[0]?.gsKey === googleDocId)) {
  } else {
    const p = librariesTemplatesGS.find(
      (lib) => lib[0]?.gsKey === googleDocId
    )[0]?.sqlTableName;
    return p;
  }
  return "NoTable";
};

const prepareColumnName = (columnName) => {
  return String(columnName).toLowerCase();
};

const getSqlCreateTableStatement = (
  librariesTemplatesGS,
  librariesTemplates
) => {
  sqlLibrariesCreateStatement = [];
  librariesTemplatesGS.map((lib) => {
    let stm = " ";
    let initTable = true;
    let tableName = "";
    let libSQLliteTemplate = [];
    lib.map((col) => {
      if (initTable) {
        tableName = String(col.sqlTableName).toLowerCase();
        stm = " DROP TABLE IF EXISTS public." + tableName + "; \n ";
        stm += "CREATE TABLE IF NOT EXISTS public." + tableName + " \n ( \n";
        let libName = col.gsName;
        if (libName === "Sheet1") libName = "FV_ALL";
        if (libName === "pola") libName = "pola_prod";

        libSQLliteTemplate = librariesTemplates.find(
          (lib) => String(lib.googleDocId) === String(col.gsKey)
        );
      }
      const columnName = String(col.sqlFieldName).toLowerCase();
      if (!columnName.includes("http")) {
        const sqlLiteColumnTemplate = libSQLliteTemplate?.columns.find(
          (column) =>
            String(column.name).toLowerCase() ===
            String(col.gsFieldName).toLowerCase()
        );
        initTable = false;
        stm += columnName;
        stm += " ";
        if (sqlLiteColumnTemplate?.type === "libEntry") {
          stm += " varchar(100) ";
          stm += " COLLATE pg_catalog.default ";
        } else if (
          sqlLiteColumnTemplate?.type === "checkbox" ||
          sqlLiteColumnTemplate?.type === "dropDownList"
        ) {
          stm += " smallint ";
        } else {
          stm += col.fieldType;
          if (col.fieldSize) stm += " COLLATE pg_catalog.default ";
        }
        stm += ", \n";
      }
    });
    stm += `uuid uuid
        )
        WITH (
            OIDS = FALSE
        )
        TABLESPACE pg_default;
    
        ALTER TABLE public.${tableName}
            OWNER to farmnode;
         `;
    sqlLibrariesCreateStatement.push(stm);
  });
  return sqlLibrariesCreateStatement;
};

const getLibrariesDataForInsert = (
  librariesTemplatesGS,
  librariesTemplates,
  librariesData
) => {
  let libsDataForImport = [];
  librariesTemplatesGS.map((libTemplate) => {
    libDataForImport = {};
    libDataForImport.libName = String(
      libTemplate[0].sqlTableName
    ).toLowerCase();
    libSQLliteTemplate = librariesTemplates.find(
      (lib) => String(lib.googleDocId) === String(libTemplate[0].gsKey)
    );
    libSQLliteData = librariesData.find(
      (lib) => lib.libUUID === libSQLliteTemplate?.libUUID
    );
    if (libSQLliteData) {
      libDataForImport.rows = joinColumns(
        libSQLliteData,
        libTemplate,
        libSQLliteTemplate
      );
      libsDataForImport.push(libDataForImport);
    }
  });

  libsDataForImport.map((lib) => {
    console.log(lib.libName);
    console.log(lib?.rows?.length);
  });

  return libsDataForImport;
};

const parseFieldType = (fieldType) => {
  if (fieldType === "float") return "real";
  if (fieldType === "datetime") return "timestamp";
  if (fieldType === "date") return "timestamp";
  if (fieldType === "varchar(max)") return "text";
  return fieldType;
};

const joinColumns = (sqlLiteDataRows, gsColumnsTemplate, sqlLiteTemplate) => {
  let sqlDataRows = [];
  sqlLiteDataRows.rows.map((rowData) => {
    let sqlData = {};
    sqlData.mementoOldId = rowData.rowUUID;
    sqlData.creationDate = rowData.creationDate;
    sqlData.modificationDate = rowData.modificationDate;

    gsColumnsTemplate.map((columnTemplate) => {
      let columnsTemplateName = String(
        columnTemplate.sqlFieldName
      ).toLowerCase();
      let foundColumnData = rowData.columns.find(
        (columnData) =>
          String(columnData.columnName).toLowerCase() ===
          columnTemplate.gsFieldName
      );

      let foundColumnTemplate = sqlLiteTemplate.columns.find(
        (columnTemplateData) =>
          columnTemplateData?.columnUUID === foundColumnData?.columnUUID
      );
      if (columnsTemplateName === "mementooldid") {
        sqlData[columnsTemplateName] = {
          value: rowData.rowUUID,
          sqlColumnName: columnsTemplateName,
          sqlType: columnTemplate.fieldType,
        };
      } else
        sqlData[columnsTemplateName] = {
          ...foundColumnData,
          value: prepareValue(
            foundColumnData?.value,
            foundColumnTemplate?.type,
            columnTemplate.fieldType
          ),
          sqlColumnName: columnsTemplateName,
          templateType: foundColumnTemplate?.type,
          templateUsage: foundColumnTemplate?.usage,
          sqlType: columnTemplate.fieldType,
        };
    });
    sqlDataRows.push(sqlData);
  });
  return sqlDataRows;
};

const prepareValue = (valueIn, fieldType, gsTypeField) => {
  if (fieldType === "dateTime" || fieldType === "date")
    return prepareDateTimeValue(valueIn);
  if (gsTypeField === "real") {
    let value = Number(String(valueIn).replace(",", "."));
    if (!isNaN(value)) return value;
    else return null;
  }
  if (fieldType === "script") {
    let value = Number(String(valueIn).replace(",", "."));
    if (!isNaN(value)) return value;
  }
  return valueIn;
};

const prepareDateTimeValue = (dateTimeValue) => {
  if (dateTimeValue) {
    return new Date(Number(dateTimeValue));
  }
  return dateTimeValue;
};

const createInsertQuery = (lib, librariesTemplates, librariesTemplatesGS) => {
  let stm = ` 
  delete from public.${lib.libName} ;
  insert into public.${lib.libName} ( `;
  let rowValues = [];
  let linksToEntries = [];
  let init = true;
  lib.rows.map((row) => {
    let colValues = [];
    for (const col in row) {
      if (row[col]?.columnName || row[col]?.sqlColumnName === "mementooldid") {
        if (init) {
          stm += col + ", ";
        }
        colValues.push(row[col].value);
        if (row[col]?.entryLinks) {
          row[col]?.entryLinks.map((entryLink) => {
            const tn = findTableName(
              entryLink.libUUID,
              librariesTemplates,
              librariesTemplatesGS
            );
            linksToEntries.push({
              mementoOldId: entryLink.rowUUID,
              tableName: tn,
              uuid: row[col].value,
              tableParentName: lib.libName,
              columnParentName: col,
              rowParentUUID: row.mementoOldId,
            });
          });
        }
      }
    }
    init = false;
    rowValues.push(colValues);
  });
  stm = stm.slice(0, -2);
  stm += ") VALUES %L ";
  return { statement: stm, values: rowValues, linksToEntries };
};

const createInsertLinksEntries = (linksToEntries) => {
  let stm = ` 
  
  INSERT INTO public.entryLinksRelations
    ( uuid, mementoOldId, tableName, tableParentName, columnParentName, rowParentUUID)
    VALUES %L `;
  let linksValues = [];
  linksToEntries.map((link) => {
    const linkRow = [
      link.uuid,
      link.mementoOldId,
      link.tableName,
      link.tableParentName,
      link.columnParentName,
      link.rowParentUUID,
    ];
    if (linkRow.length !== 6) console.log("linkRow.length", linkRow.length);
    linksValues.push(linkRow);
  });
  return { linksValues, linksStatements: stm };
};

const createInsertColumnsTemplates = (columnsTemplates) => {
  const stm = `
    delete from  public.libraries_columns_templates ; 
    INSERT INTO public.libraries_columns_templates (
        uuid, lib_uuid, name, usage, sort_order, hint, field_type, options, sql_field_name, sql_field_type )  
        VALUES %L       
    `;

  const columnsValues = [];
  columnsTemplates.map((columnTemplate) => {
    const columnValue = [];
    for (const col in columnTemplate) {
      if (col != "googleDocId") columnValue.push(columnTemplate[col]);
    }
    columnsValues.push(columnValue);
  });
  return { columnsValues: columnsValues, statement: stm };
};

const createInsertLibrariesTemplates = (librariesTemplates) => {
  const stm = `
      delete from  public.libraries_templates ; 
      INSERT INTO public.libraries_templates (
          uuid, name, google_Doc_Id, sql_table_name)  
          VALUES %L       
      `;

  const librariesValues = [];
  librariesTemplates.map((columnTemplate) => {
    const libraryValue = [];
    for (const col in columnTemplate) {
      libraryValue.push(columnTemplate[col]);
    }
    librariesValues.push(libraryValue);
  });
  return { librariesValues: librariesValues, statement: stm };
};

exports.findTableName = findTableName;
exports.createInsertQuery = createInsertQuery;
exports.prepareDateTimeValue = prepareDateTimeValue;
exports.prepareValue = prepareValue;
exports.joinColumns = joinColumns;
exports.parseFieldType = parseFieldType;
exports.getLibrariesDataForInsert = getLibrariesDataForInsert;
exports.getSqlCreateTableStatement = getSqlCreateTableStatement;
exports.prepareColumnName = prepareColumnName;
exports.createInsertLinksEntries = createInsertLinksEntries;
exports.createInsertColumnsTemplates = createInsertColumnsTemplates;
exports.createInsertLibrariesTemplates = createInsertLibrariesTemplates;

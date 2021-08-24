const Database = require("better-sqlite3");
const sqlLiteConfig = require("./config/dbConfig");
// open the database
let db = new Database(sqlLiteConfig.path);

const getComponentTypeByDBType = (type_code) => {
  switch (type_code) {
    case "ft_real":
      return "float";
    case "ft_boolean":
      return "checkbox";
    case "ft_string":
      return "string";
    case "ft_rich_text":
      return "string";
    case "ft_img":
      return "image";
    case "ft_int":
      return "int";
    case "ft_barcode":
      return "barcode";
    case "ft_audio":
      return "audio";
    case "ft_date_time":
      return "dateTime";
    case "ft_date":
      return "date";
    case "ft_lib_entry":
      return "libEntry";
    case "ft_str_list":
      return "dropDownList";
    case "ft_rating":
      return "rating";
    case "ft_calc":
      return "calculate";
    case "ft_script":
      return "script";

    default:
      return "";
  }
};

const getUsageTypeByDBType = (usage) => {
  switch (usage) {
    case 1:
      return "title";
    case 2:
      return "description";
    default:
      return "";
  }
};

const getOptionForColumnByType = (columnTemplateUUID, columnType) => {
  let options = [];
  if (columnType === "ft_str_list") {
    const optionsRaw = db
      .prepare(
        `select c.stringContent
            from tbl_flex_content2 c
            join tbl_flex_template t on t.uuid =c.templateUUID       
            where  c.templateUUID = ? 
            and c.intContent=0 and t.type_code = 'ft_str_list' 
            `
      )
      .all(columnTemplateUUID);

    optionsRaw.forEach((rowOfOption) => {
      const dbOptions = JSON.parse(rowOfOption?.stringContent);
      options = dbOptions?.sl?.map((item) => {
        return {
          value: item?.t,
          index: item?.c,
          default: item?.def,
        };
      });
    });
  } else if (columnType === "ft_lib_entry") {
    const libDict = db
      .prepare(
        `select lr.title, lr.UUID
        from tbl_flex_content2 c
        join tbl_flex_template t on t.uuid=c.templateUUID
        join tbl_library lr on lr.uuid=c.stringContent
        where c.templateUUID = ? and c.intContent >= 0
        and t.type_code = 'ft_lib_entry'
        `
      )
      .get(columnTemplateUUID);

    options.push({
      dictionaryLibraryUUID: libDict?.UUID,
      dictionaryLibraryName: libDict?.TITLE,
    });
  }
  return options;
};

const getColumnsByLibraryUUID = (Lib_UUID) => {
  const columns = [];

  const columnsRaw = db
    .prepare(
      `select title, type_code, usage, tab_show,sortorder,hint, UUID
      from tbl_flex_template 
      where lib_uuid = ? `
    )
    .all(Lib_UUID);

  columnsRaw.forEach((rowOfColumn) => {
    columns.push({
      name: rowOfColumn?.title,
      type: getComponentTypeByDBType(rowOfColumn?.type_code),
      order: rowOfColumn?.sortorder,
      description: rowOfColumn?.hint,
      defaultValue: "",
      columnUUID: rowOfColumn?.UUID,
      usage: getUsageTypeByDBType(rowOfColumn?.usage),
      options: getOptionForColumnByType(
        rowOfColumn?.UUID,
        rowOfColumn?.type_code
      ),
    });
  });
  return columns;
};

const getLibrariesTemplates = () => {
  const librariesData = [];
  const librariesTemplates = [];
  const librariesTemplatesRaw = db
    .prepare(
      `select uuid, title, googleDocId, googleDocWorksheet, group_id
      from tbl_library
      where title in ('pola','srodki 2020 PROD', 'Uprawy PROD', 
      'SoR Mieszaniny 2020 PROD', 'PaPu Nawozenie PROD',
       'FV_All', 'Przeglad maszyny PROD', 'Filtry i oleje PROD',
       'Pojazdy PROD', 'Tankowanie PROD', 'SoR Mieszaniny PROD', 
       'Nawozy PROD', 'srodki PROD', 'Nasiona PROD', 'Atrybuty pol PROD'
       )
     and googleDocId is not null    
    `
    )
    .all();

  librariesTemplatesRaw.forEach((library, index) => {
    libUUID = library.UUID;

    librariesTemplates.push({
      name: library?.TITLE,
      id: index,
      libUUID: library.UUID,
      googleDocId: library.googleDocId,
      columns: getColumnsByLibraryUUID(libUUID),
    });
    librariesData.push({
      id: index,
      name: library?.TITLE,
      libUUID: library.UUID,
      googleDocId: library.googleDocId,
      rows: getRecordsRowByLibraryUUID(libUUID),
    });
  });

  return {
    librariesTemplates: librariesTemplates,
    librariesData: librariesData,
  };
};

const getRecordsRowByLibraryUUID = (Lib_UUID) => {
  const rows = [];
  const rowsDataRaw = db
    .prepare(
      `select uuid, creation_date, edit_time, UNIQUE_NAME_VALUE
        from tbl_library_item 
        where lib_uuid = ? `
    )
    .all(Lib_UUID);
  rowsDataRaw.forEach((row) => {
    // console.log("rowUUID ", rowUUID);
    rows.push({
      uniqueName: row?.UNIQUE_NAME_VALUE,
      creationDate: row?.creation_date,
      modificationDate: row?.EDIT_TIME,
      rowUUID: row?.UUID,
      columns: getColumnsDataByRowId(row?.UUID),
    });
  });
  return rows;
};

const getLinksToEntries = (column) => {
  if (column.type_code !== "ft_lib_entry" || !column.stringContent) return;
  const linksData = [];
  const linksToEntriesRaw = db
    .prepare(
      `select i.UNIQUE_NAME_VALUE,i.lib_uuid,r.slave_item_uuid
      from tbl_relations r
      join tbl_library_item i on i.uuid=r.slave_item_uuid
      where rel_uuid = ? `
    )
    .all(column.stringContent);

  linksToEntriesRaw.forEach((linkData) => {
    linksData.push({
      uniqueName: linkData.UNIQUE_NAME_VALUE,
      libUUID: linkData.LIB_UUID,
      rowUUID: linkData.slave_item_uuid,
    });
  });
  return linksData;
};

const getColumnsDataByRowId = (rowUUID) => {
  const columnsData = [];
  const columnsDataRaw = db
    .prepare(
      `select c.stringContent, c.realContent, c.intContent, t.title, c.templateUUID, t.type_code
        from tbl_flex_content2 c
        join tbl_flex_template t on t.UUID = c.templateUUID 
        WHERE ownerUUID =  ? `
    )
    .all(rowUUID);

  columnsDataRaw.forEach((column) => {
    columnsData.push({
      value: getValue(
        column?.stringContent,
        column?.realContent,
        column?.intContent
      ),
      columnName: column?.title,
      columnUUID: column?.templateUUID,
      entryLinks: getLinksToEntries(column),
    });
  });
  return columnsData;
};

const getValue = (stringValue, floatValue, intValue) => {
  if (stringValue) return stringValue;
  if (floatValue) return floatValue;
  if (intValue) return intValue;
};

const getLibrariesTemplatesColumnsForPostgres = () => {
  const columnsTemplates = [];
  const columnsTemplatesRaw = db
    .prepare(
      `select t.UUID, t.title, t.type_code, t.usage, t.lib_uuid, t.hint, t.sortorder, l.googleDocId
      from tbl_flex_template t
      join tbl_library l on l.uuid=t.lib_uuid
      where l.googleDocId is not null `
    )
    .all();

  columnsTemplatesRaw.forEach((column) => {
    columnsTemplates.push({
      uuid: column?.UUID,
      lib_uuid: column?.LIB_UUID,
      name: column?.title,
      usage: column?.usage,
      sortorder: column?.sortorder,
      hint: column?.hint,
      googleDocId: column?.googleDocId,
      type_code: getComponentTypeByDBType(column?.type_code),
      options: JSON.stringify(
        getOptionForColumnByType(column?.UUID, column?.type_code)
      ),
    });
  });
  return columnsTemplates;
};

const getLibrariesTemplatesForPostgres = () => {
  const librariesTemplates = [];
  const librariesTemplatesRaw = db
    .prepare(
      `select uuid, TITLE, googleDocId 
      from tbl_library 
      where googleDocId is not null
      `
    )
    .all();

  librariesTemplatesRaw.forEach((column) => {
    librariesTemplates.push({
      uuid: column?.UUID,
      name: column?.TITLE,
      googleDocId: column?.googleDocId,
    });
  });
  return librariesTemplates;
};

//Close database connection after some time
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log("Close the database connection.");
  });
}, 5000);

exports.getLibrariesTemplates = getLibrariesTemplates;
exports.getLibrariesTemplatesColumnsForPostgres =
  getLibrariesTemplatesColumnsForPostgres;
exports.getLibrariesTemplatesForPostgres = getLibrariesTemplatesForPostgres;

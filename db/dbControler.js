const {
  stopClientConnection,
  startClientConnection,
  selectStatement,
} = require("./postgres");

class PgController {
  async getAllTemplatesLibrariesWithColumns(withClient) {
    const stm = `
    select name,uuid as libUUID, row_number() OVER (ORDER BY name) AS  id,
	array(select json_build_object(
		'type', c.field_type, 'name', c.name, 'order', c.sort_order, 'description', c.hint, 'defaultValue', '',
		'columnUUID', c.uuid, 'usage', case when c.usage = 1 then 'title' when c.usage=2  then 'description' else '' end,
		'options', c.options, 'sqlFieldName', c.sql_field_name
		
		) from libraries_columns_templates c where c.lib_uuid=l.uuid) as columns
from libraries_templates l
join information_schema.tables st on lower(st.table_name) = lower(l.sql_table_name)
where st.table_schema = 'public'
        `;
    if (withClient) await startClientConnection();
    const rows = await selectStatement(stm);
    if (withClient) await stopClientConnection();
    return rows;
  }

  prepareLibraryDataForGraphQl(dataRows, { libUUID, name }) {
    const rows = dataRows.map((row) => {
      return {
        rowUUID: row.mementooldid,
        rowJSON: JSON.stringify(row),
        fe_title: row?.fe_title,
        fe_description: row?.fe_description,
      };
    });
    const libData = {
      name,
      libUUID,
      rows,
    };
    return libData;
  }

  async getLibDataByName(libName, withClient) {
    if (withClient) await startClientConnection();

    const templateLibRow = await this.getTemplateLibraryByName(libName);
    const templatesColumnsRows = await this.getTemplateColumnsByLibUUID(
      templateLibRow[0].uuid
    );
    const statement = this.createLibraryStatement(
      templatesColumnsRows,
      templateLibRow[0].sql_table_name
    );

    const libraryDataRows = await selectStatement(statement);
    if (withClient) await stopClientConnection();

    const libDataGraphql = this.prepareLibraryDataForGraphQl(libraryDataRows, {
      libUUID: templateLibRow[0].uuid,
      name: templateLibRow[0].name,
    });
    return libDataGraphql;
  }

  async getTemplateLibraryByName(libName) {
    const query = {
      name: "fetch-library-template",
      text: "select * from libraries_templates where lower(sql_table_name) = lower($1)",
      values: [libName],
    };
    const rows = await selectStatement(query);
    return rows;
  }

  async getTemplateColumnsByLibUUID(libUUID) {
    const query = {
      name: "fetch-templates-columns",
      text: "select * from libraries_columns_templates where lib_uuid = $1 and sql_field_name is not null",
      values: [libUUID],
    };
    const rows = await selectStatement(query);
    return rows;
  }
  createEntryLinksSubQuery(sqlColumnName) {
    let stm = `
      json_build_object('value', l.${sqlColumnName},
'entrylinks' ,array( select json_build_object( 'rowUUID', el.mementoOldId, 'tableName', el.tableName,
									 'columnParentName', el.columnParentName,
									 'libUUID', ( select uuid from libraries_templates where sql_table_name = el.tableName limit 1),
                                     'rowTitle', (select title
                                        from get_entry_link_title_by_lib_row_uuid(( select uuid from libraries_templates where sql_table_name = el.tableName limit 1),el.mementoOldId)
                                      )   
									) 
		   from entrylinksrelations el where el.uuid::varchar(100) = l.${sqlColumnName}
		  ) 
 ) as ${sqlColumnName} ,
      `;

    return stm;
  }
  createInfoCallStatement(templatesColumnsRows) {
    let stmTitle = "";
    let stmDescription = "";
    templatesColumnsRows.map((col) => {
      if (col.usage === 1) stmTitle += ` ${col.sql_field_name} || ' ' || `;
      if (col.usage === 2)
        stmDescription += ` ${col.sql_field_name} || ' ' ||  `;
    });
    if (stmTitle.length) stmTitle = stmTitle.slice(0, -11) + " as fe_title,";
    if (stmDescription.length)
      stmDescription = stmDescription.slice(0, -11) + " as fe_description,";
    return { titleStatement: stmTitle, descriptionStatement: stmDescription };
  }
  createLibraryStatement(templatesColumnsRows, sqlLibraryName) {
    let stm = " select ";
    templatesColumnsRows.map((col) => {
      if (col.field_type !== "libEntry") {
        stm += ` ${col.sql_field_name}, `;
      } else {
        stm += this.createEntryLinksSubQuery(col.sql_field_name);
      }
    });
    const { titleStatement, descriptionStatement } =
      this.createInfoCallStatement(templatesColumnsRows);
    stm += titleStatement;
    stm += descriptionStatement;
    stm += " mementoOldId";
    stm += ` from ${sqlLibraryName} l `;
    return stm;
  }
}

exports.PgController = PgController;

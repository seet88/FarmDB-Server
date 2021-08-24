const typeDefs = `
type columnTemplateOptions{
    value: String
    index: Int
    default: Boolean
    dictionaryLibraryUUID: String
    dictionaryLibraryName: String

}

type libraryTemplateColumn{
    name: String
    type: String
    order: Int
    description: String
    usage: String
    defaultValue: String 
    columnUUID: String  
    sqlFieldName: String
    options: [columnTemplateOptions] 
}

type libraryTemplate{
    name: String
    id: Int
    libUUID: String
    columns: [libraryTemplateColumn]
}

type entryLinksData{
    uniqueName: String
    libUUID: String
    rowUUID: String
}

type libraryColumnData{
    value: String
    columnName: String
    columnUUID: String
    entryLinks: [entryLinksData]
}

type libraryRowData{
    rowUUID: String
    modificationDate: String
    creationDate: String
    uniqueName: String
    columns:[libraryColumnData]


}

type libraryData{
    name: String
    id: Int
    libUUID: String
    rows: [libraryRowData]

}

type libraryRowsDataPG{
    rowUUID: String
    fe_title: String
    fe_description: String
    rowJSON: String
}

type librariesDataPG{
    name: String
    id: Int
    libUUID: String
    rows: [libraryRowsDataPG]

}


type Query{
    librariesTemplates: [libraryTemplate]
    librariesData: [libraryData]
    librariesDataPG: [librariesDataPG]
}

`;

exports.typeDefs = typeDefs;

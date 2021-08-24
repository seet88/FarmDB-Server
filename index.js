const { getLibrariesTemplates } = require("./db/sqlLite");
const { PgController } = require("./db/dbControler");
const {
  startClientConnection,
  stopClientConnection,
} = require("./db/postgres");
const { GraphQLServer, PubSub } = require("graphql-yoga");
const { typeDefs } = require("./graphql/typeDefs");

const { librariesTemplates, librariesData } = getLibrariesTemplates();
const pgController = new PgController();
const pgLibrariesData = [];
let pgLibsTemplates = [];

const getPGLibrariesTemplates = async () => {
  const withClient = false;
  const templatesLibs = await pgController.getAllTemplatesLibrariesWithColumns(
    withClient
  );
  templatesLibs.map((lib) => {
    lib.libUUID = lib.libuuid;
  });
  return templatesLibs;
};

const getLibrariesData = async () => {
  const libsToImport = [
    "srodki_2018_PROD",
    "SoR_Mieszaniny_2018_PROD",
    "przeglad_maszyny_prod",
    "papu_nawozenie_2018_prod",
    "filtry_i_oleje_prod",
    "tankowanie_prod",
    "pojazdy_prod",
  ];
  let id = 0;
  return Promise.all(
    libsToImport.map(async (libSQLName) => {
      const data = await pgController.getLibDataByName(libSQLName);
      data.id = id;
      console.log(data?.name);
      pgLibrariesData.push(data);
      id++;
    })
  );
};

const getDataFromDB = async () => {
  await startClientConnection();
  pgLibsTemplates = await getPGLibrariesTemplates();
  await getLibrariesData();
  await stopClientConnection();
};
getDataFromDB();

/**
 * graphql - for webClient
 */

const resolvers = {
  Query: {
    librariesTemplates: () => pgLibsTemplates,
    librariesData: () => librariesData,
    librariesDataPG: () => {
      console.log(pgLibrariesData[0]?.name, pgLibrariesData[1]?.name);
      return pgLibrariesData;
    },
  },
  //   Mutation: {
  // postDataFromAog: (parent, { dataFromAogInput }) => {
  //   const id = 1;
  //   console.log(dataFromAogInput);
  //   dataFromAog = dataFromAogInput;
  //   subscribers.forEach((fn) => fn());
  //   return id;
  // },
  //   },
};

const pubsub = new PubSub();

const serverWeb = new GraphQLServer({
  typeDefs,
  resolvers,
  context: { pubsub },
});

serverWeb.start(({ port }) => {
  console.log(`Server running on http://localhost:${port}/`);
});

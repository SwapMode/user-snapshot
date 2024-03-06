import { GraphQLClient, gql } from "graphql-request";
import { BigNumber } from "bignumber.js";
import { join } from "path";
import { commify } from "ethers/lib/utils";
import { writeJson } from "fs-extra";

const csv = require("csvtojson");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const modeV2Client = new GraphQLClient(
  "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/swapmode-v2/1.0.4/gn"
);

async function run() {
  try {
    // Test block to try
    const blocks = [4749316];
    let fileData = [];

    for (const block of blocks) {
      const data = await getBlockData(block);
      fileData = [...fileData, ...data];
    }

    await writeCSV(
      join(process.cwd(), "user-tvl-snapshot.csv"),
      [
        { id: "user", title: "user" },
        { id: "pool", title: "pool" },
        { id: "block", title: "block" },
        { id: "lpvalue", title: "lpvalue" },
      ],
      fileData
    );

    await writeJson(join(process.cwd(), "user-tvl-snapshot.json"), fileData);
  } catch (error) {
    console.log(error);
  }
}

async function getBlockData(block: number) {
  // Aggregate any needed "pages" from subgraph for the block
  // Max page size is 1000
  const fileData = [];

  const pageSize = 1000;
  let skip = 0;
  let moreToFetch = true;

  while (moreToFetch) {
    const data: any = await modeV2Client.request(gql`
        query UsersQuery {
          users(block: { number: ${block} }, first: ${pageSize}, skip: ${skip}) {
            id
            liquidityPositions {
              liquidityTokenBalance
              pair {
                id
                reserveUSD
                totalSupply
              }
            }
          }
        }
      `);

    // If the max 1000 items are returned then there are more to fetch
    moreToFetch = data.users.length === pageSize;
    skip += pageSize;

    for (const user of data.users) {
      user.liquidityPositions.forEach((pos) => {
        const liquidityTokenBalance = new BigNumber(pos.liquidityTokenBalance);
        const reserveUSD = new BigNumber(pos.pair.reserveUSD);
        const totalSupply = new BigNumber(pos.pair.totalSupply);
        const lpPrice = reserveUSD.div(totalSupply);
        const lpvalue = liquidityTokenBalance.multipliedBy(lpPrice).toFixed(4);

        // console.log('liquidityTokenBalance', liquidityTokenBalance.toString());
        // console.log('reserveUSD', reserveUSD.toString());
        // console.log('lpPrice', lpPrice.toString());
        // console.log('lpvalue', lpvalue);

        if (user.id !== "0x0000000000000000000000000000000000000000") {
          fileData.push({
            user: user.id,
            pool: pos.pair.id,
            block,
            lpvalue: commify(lpvalue),
          });
        }
      });
    }
  }

  return fileData;
}

async function writeCSV(
  outputPath: string,
  headers: {
    id: string;
    title: string;
  }[],
  data: any[]
) {
  try {
    const csvWriter = createCsvWriter({
      path: outputPath,
      header: headers,
    });
    await csvWriter.writeRecords(data);
  } catch (error) {
    throw error;
  }
}

export function parseCsvToJSON(csvFilePath: string) {
  return csv().fromFile(csvFilePath);
}

run();

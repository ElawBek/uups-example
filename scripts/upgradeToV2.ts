import { ethers, run } from "hardhat";

import { parseEther } from "ethers/lib/utils";

import {
  Token__factory,
  VaultV1__factory,
  VaultV2__factory,
} from "../typechain-types";

const TOKEN1_ADDRESS = "0xf9bf22ad901D555e35C50AF17B933308876a3067";
const PROXY_ADDRESS = "0xC762B63f8ccB79d1254dB47B7b3EFF98D92F81cE";

async function main() {
  const [signer] = await ethers.getSigners();

  const token2 = await new Token__factory(signer).deploy("Test2", "TEST2");
  await token2.deployed();

  let tx = await token2.mint(signer.address, parseEther("1000"));
  await tx.wait();

  const implV2 = await new VaultV2__factory(signer).deploy();
  await implV2.deployed();

  const vaultV1Proxy = new VaultV1__factory(signer).attach(PROXY_ADDRESS);

  tx = await vaultV1Proxy.upgradeTo(implV2.address);
  await tx.wait();

  const vaultV2 = new VaultV2__factory(signer).attach(PROXY_ADDRESS);

  tx = await vaultV2.connect(signer).addToken(token2.address);
  await tx.wait();

  console.log(
    `TotalSupply of token1: ${await vaultV2.totalSupply(TOKEN1_ADDRESS)}`
  );

  console.log(`Support of token2: ${await vaultV2.assets(token2.address)}`);

  await run("verify:verify", {
    address: implV2.address,
    contract: "contracts/VaultV2.sol:VaultV2",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

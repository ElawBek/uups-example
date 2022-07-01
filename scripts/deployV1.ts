import { ethers, run } from "hardhat";

import { parseEther } from "ethers/lib/utils";

import { Token__factory, VaultV1__factory } from "../typechain-types";
import { ERC1967Proxy__factory } from "../typechain-types/factories/contracts/openzeppelin";

async function main() {
  const [signer] = await ethers.getSigners();

  const token1 = await new Token__factory(signer).deploy("Test", "TEST");
  await token1.deployed();

  let tx = await token1.mint(signer.address, parseEther("1000"));
  await tx.wait();

  const implV1 = await new VaultV1__factory(signer).deploy();
  await implV1.deployed();

  const data = implV1.interface.encodeFunctionData("initialize", [
    token1.address,
    "Vault",
  ]);

  const proxy = await new ERC1967Proxy__factory(signer).deploy(
    implV1.address,
    data
  );
  await proxy.deployed();

  const vaultV1 = new VaultV1__factory(signer).attach(proxy.address);

  tx = await token1.connect(signer).approve(vaultV1.address, parseEther("100"));
  await tx.wait();

  tx = await vaultV1.connect(signer).deposit(parseEther("100"));
  await tx.wait();

  console.log(
    `TotalSupply of token: ${await vaultV1.totalSupply(token1.address)}`
  );

  await run("verify:verify", {
    address: token1.address,
    contract: "contracts/Token.sol:Token",
    constructorArguments: ["Test", "TEST"],
  });

  await run("verify:verify", {
    address: implV1.address,
    contract: "contracts/VaultV1.sol:VaultV1",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

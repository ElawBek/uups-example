import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";

import {
  VaultV1__factory,
  VaultV2__factory,
  Token__factory,
} from "../../typechain-types";

import { ERC1967Proxy__factory } from "../../typechain-types/factories/contracts/openzeppelin";

export async function deployVer1Fixture() {
  const { tokenOne, tokenTwo, tokenThree, owner, alice } = await loadFixture(
    deployTokensFixture
  );

  const implV1 = await new VaultV1__factory(owner).deploy();
  const data = implV1.interface.encodeFunctionData("initialize", [
    tokenOne.address,
    "Vault",
  ]);

  const proxy = await new ERC1967Proxy__factory(owner).deploy(
    implV1.address,
    data
  );

  const vaultV1 = new VaultV1__factory(owner).attach(proxy.address);

  return { owner, alice, tokenOne, tokenTwo, tokenThree, vaultV1, implV1 };
}

export async function prepareForUpgradeFixture() {
  const { owner, alice, vaultV1, tokenOne, tokenTwo, tokenThree } =
    await loadFixture(deployVer1Fixture);

  // do some actions with vault ver 1
  await tokenOne.connect(alice).approve(vaultV1.address, parseEther("100"));
  await tokenTwo.connect(owner).approve(vaultV1.address, parseEther("100"));

  await vaultV1.connect(alice).deposit(parseEther("100"));

  await vaultV1.changeToken(tokenTwo.address);

  await vaultV1.connect(owner).deposit(parseEther("100"));
  await vaultV1.connect(alice).withdraw(tokenOne.address, parseEther("10"));

  return { owner, alice, tokenOne, tokenTwo, vaultV1, tokenThree };
}

export async function deployVer2Fixture() {
  const { owner, alice, vaultV1, tokenOne, tokenTwo, tokenThree } =
    await loadFixture(prepareForUpgradeFixture);

  const implV2 = await new VaultV2__factory(owner).deploy();

  await vaultV1.upgradeTo(implV2.address);

  const vaultV2 = new VaultV2__factory(owner).attach(vaultV1.address);

  await vaultV2.addToken(tokenOne.address);

  return { owner, alice, tokenOne, tokenTwo, vaultV2, tokenThree };
}

async function deployTokensFixture() {
  const [owner, alice] = await ethers.getSigners();

  const tokenOne = await new Token__factory(owner).deploy("TokenOne", "TKN1");
  await tokenOne.mint(owner.address, parseEther("100"));
  await tokenOne.mint(alice.address, parseEther("100"));

  const tokenTwo = await new Token__factory(owner).deploy("TokenTwo", "TKN2");
  await tokenTwo.mint(owner.address, parseEther("100"));
  await tokenTwo.mint(alice.address, parseEther("100"));

  const tokenThree = await new Token__factory(owner).deploy("TokenTwo", "TKN2");
  await tokenThree.mint(owner.address, parseEther("1000"));
  await tokenThree.mint(alice.address, parseEther("1000"));

  return { tokenOne, tokenTwo, tokenThree, owner, alice };
}

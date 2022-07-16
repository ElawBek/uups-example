import { ethers } from "hardhat";

import { parseEther } from "ethers/lib/utils";

import { deployTokens, vaultActions } from "./common";

import {
  VaultV1__factory,
  ERC1967Proxy__factory,
  VaultV2__factory,
} from "../../typechain-types";

export async function deployVersionOneFixture() {
  const [owner, alice] = await ethers.getSigners();
  const { token0, token1 } = await deployTokens(owner, alice);

  const implV1 = await new VaultV1__factory(owner).deploy();
  const initializeData = implV1.interface.encodeFunctionData("initialize", [
    token0.address,
    "Vault",
  ]);

  const proxy = await new ERC1967Proxy__factory(owner).deploy(
    implV1.address,
    initializeData
  );
  const vaultV1Proxy = new VaultV1__factory(owner).attach(proxy.address);

  await token0.connect(owner).approve(vaultV1Proxy.address, parseEther("100"));

  return {
    owner,
    alice,
    token0,
    token1,
    implV1,
    vaultV1Proxy,
  };
}

export async function deployVersionTwoFixture() {
  const [owner, alice] = await ethers.getSigners();
  const { token0, token1, token2 } = await deployTokens(owner, alice);

  const implV1 = await new VaultV1__factory(owner).deploy();
  const initializeData = implV1.interface.encodeFunctionData("initialize", [
    token0.address,
    "Vault",
  ]);

  const proxy = await new ERC1967Proxy__factory(owner).deploy(
    implV1.address,
    initializeData
  );
  const vaultV1Proxy = new VaultV1__factory(owner).attach(proxy.address);

  await vaultActions(owner, alice, [token0, token1], vaultV1Proxy);

  const implV2 = await new VaultV2__factory(owner).deploy();

  const data = implV2.interface.encodeFunctionData("addToken", [
    token1.address,
  ]);

  await vaultV1Proxy.connect(owner).upgradeToAndCall(implV2.address, data);

  const vaultV2Proxy = new VaultV2__factory(owner).attach(vaultV1Proxy.address);

  return {
    owner,
    alice,
    token0,
    token1,
    token2,
    implV2,
    vaultV2Proxy,
  };
}

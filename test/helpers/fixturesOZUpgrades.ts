import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";

import {
  VaultV1__factory,
  VaultV1,
  VaultV2,
  VaultV2__factory,
  Token__factory,
} from "../../typechain-types";

export async function deployVer1Fixture() {
  const { tokenOne, tokenTwo, tokenThree, owner, alice } = await loadFixture(
    deployTokensFixture
  );

  const ImplFactory = new VaultV1__factory(owner);

  const vaultV1 = (await upgrades.deployProxy(
    ImplFactory,
    [tokenOne.address, "Vault"],
    {
      initializer: "initialize",
      kind: "uups",
    }
  )) as VaultV1;

  return { owner, alice, tokenOne, tokenTwo, tokenThree, vaultV1 };
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

  const ImplFactory = new VaultV2__factory(owner);

  const vaultV2 = (await upgrades.upgradeProxy(vaultV1.address, ImplFactory, {
    kind: "uups",
  })) as VaultV2;

  await vaultV2.addToken(tokenOne.address);

  return { owner, alice, tokenOne, tokenTwo, vaultV1, vaultV2, tokenThree };
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

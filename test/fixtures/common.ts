import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseEther } from "ethers/lib/utils";

import { Token, Token__factory, VaultV1 } from "../../typechain-types";

export async function deployTokens(
  owner: SignerWithAddress,
  alice: SignerWithAddress
) {
  let tokens: Token[] = [];

  for (let i = 0; i < 3; i++) {
    tokens[i] = await new Token__factory(owner).deploy(`Token${i}`, `TK${i}`);

    tokens[i].connect(owner).mint(owner.address, parseEther("100"));
    tokens[i].connect(owner).mint(alice.address, parseEther("100"));
  }

  return { token0: tokens[0], token1: tokens[1], token2: tokens[2] };
}

export async function vaultActions(
  owner: SignerWithAddress,
  alice: SignerWithAddress,
  tokens: Token[],
  vaultV1Proxy: VaultV1
) {
  for (let i = 0; i < tokens.length; i++) {
    await tokens[i]
      .connect(owner)
      .approve(vaultV1Proxy.address, parseEther("100"));
    await tokens[i]
      .connect(alice)
      .approve(vaultV1Proxy.address, parseEther("100"));
  }

  await vaultV1Proxy.connect(owner).deposit(parseEther("100"));
  await vaultV1Proxy.connect(alice).deposit(parseEther("50"));

  await vaultV1Proxy.connect(owner).changeToken(tokens[1].address);

  await vaultV1Proxy.connect(alice).deposit(parseEther("50"));
}

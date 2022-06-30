import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseEther } from "ethers/lib/utils";

import { signERC2612Permit } from "eth-permit";

import {
  VaultV1,
  VaultV1__factory,
  Token,
  Token__factory,
  VaultV2,
  VaultV2__factory,
  TransparentUpgradeableProxy__factory,
  ERC1967Proxy,
} from "../typechain-types";

import { ERC1967Proxy__factory } from "../typechain-types/factories/contracts/openzeppelin";

import { constants } from "ethers";

describe("UUPS", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let tokenOne: Token;
  let tokenTwo: Token;

  let implV1: VaultV1;
  let proxy: ERC1967Proxy;

  let vaultV1: VaultV1;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    tokenOne = await new Token__factory(owner).deploy("TokenOne", "TKN1");
    await tokenOne.mint(owner.address, parseEther("100"));
    await tokenOne.mint(alice.address, parseEther("100"));

    tokenTwo = await new Token__factory(owner).deploy("TokenTwo", "TKN2");
    await tokenTwo.mint(owner.address, parseEther("100"));
    await tokenTwo.mint(alice.address, parseEther("100"));

    implV1 = await new VaultV1__factory(owner).deploy();
    const data = implV1.interface.encodeFunctionData("initialize", [
      tokenOne.address,
      "Vault",
    ]);

    proxy = await new ERC1967Proxy__factory(owner).deploy(implV1.address, data);

    vaultV1 = new VaultV1__factory(owner).attach(proxy.address);
  });

  describe("1 ver", () => {
    describe("Deployment", () => {
      it("Proxy state", async () => {
        expect([
          await vaultV1.name(), // proxy name
          await vaultV1.token(), // current token
          await vaultV1.minAmount(), // minimum amount of token for deposit
          await vaultV1.totalSupply(tokenOne.address), // totalSupply of current token
          await vaultV1.owner(), // contract's owner
        ]).to.deep.eq([
          "Vault",
          tokenOne.address,
          parseEther("0.1"),
          constants.Zero,
          owner.address,
        ]);
      });

      it("Origin state", async () => {
        expect([
          await implV1.name(), // origin contract name
          await implV1.token(),
          await implV1.minAmount(),
          await implV1.owner(), // contract's owner
        ]).to.deep.eq([
          "",
          constants.AddressZero,
          constants.Zero,
          constants.AddressZero,
        ]);
      });

      it("Origin initialize revert", async () => {
        await expect(
          implV1.initialize(tokenOne.address, "VaultError")
        ).to.revertedWith("Initializable: contract is already initialized");
      });
    });

    describe("previewDeposit and previewWithdraw reverts", () => {
      it("previewDeposit's revert", async () => {
        try {
          await vaultV1.previewDeposit(tokenTwo.address, parseEther("0.1"));
        } catch (error: any) {
          expect(error.errorName).to.eq("WrongAddress");
          expect(error.errorArgs).to.deep.eq([
            "previewDeposit",
            tokenTwo.address,
          ]);
        }
      });

      it("previewWithdraw's revert", async () => {
        // 0
        const totalSupply = await vaultV1.totalSupply(tokenOne.address);

        try {
          await vaultV1.previewWithdraw(tokenOne.address, parseEther("0.1"));
        } catch (error: any) {
          expect(error.errorName).to.eq("NotEnoughAmount");
          expect(error.errorArgs).to.deep.eq(["previewWithdraw", totalSupply]);
        }
      });
    });

    describe("Deposit functionality", () => {
      it("Revert NotEnoughAmount in deposit function", async () => {
        await expect(vaultV1.deposit(parseEther("0.01"))).to.revertedWith(
          `NotEnoughAmount("deposit", ${parseEther("0.01")})`
        );
      });

      it("ERC20: insufficient allowance revert", async () => {
        await expect(vaultV1.deposit(parseEther("0.1"))).to.revertedWith(
          "ERC20: insufficient allowance"
        );
      });

      it("Success deposit from two users", async () => {
        // 10e18
        let share = await vaultV1.previewDeposit(
          tokenOne.address,
          parseEther("10")
        );

        await tokenOne
          .connect(alice)
          .approve(vaultV1.address, parseEther("10"));

        await expect(vaultV1.connect(alice).deposit(parseEther("10")))
          .to.emit(vaultV1, "Deposit")
          .withArgs(alice.address, tokenOne.address, share);

        expect([
          await vaultV1.totalSupply(tokenOne.address),
          await vaultV1.balances(tokenOne.address, alice.address),
        ]).to.deep.eq([parseEther("10"), share]);

        // shares = amount * TotalSupply / Balance before deposit
        // shares = 100e18 * 10e18 / 10e18 = 100e18 (just 1:1)
        share = await vaultV1.previewDeposit(
          tokenOne.address,
          parseEther("100")
        );

        await tokenOne.approve(vaultV1.address, parseEther("100"));

        await expect(vaultV1.deposit(parseEther("100")))
          .to.emit(vaultV1, "Deposit")
          .withArgs(owner.address, tokenOne.address, share);

        expect([
          await vaultV1.totalSupply(tokenOne.address),
          await vaultV1.balances(tokenOne.address, owner.address),
        ]).to.deep.eq([parseEther("110"), share]);
      });
    });

    describe("Withdraw functionality", () => {
      it("Revert NotEnoughAmount in withdraw function", async () => {
        expect(await vaultV1.balances(tokenOne.address, alice.address)).to.eq(
          constants.Zero
        );

        await expect(
          vaultV1.connect(alice).withdraw(tokenOne.address, parseEther("1"))
        ).to.revertedWith(`NotEnoughAmount("withdraw", ${parseEther("1")})`);
      });

      it("Success withdraw to two users", async () => {
        await tokenOne
          .connect(alice)
          .approve(vaultV1.address, parseEther("10"));
        await tokenOne.approve(vaultV1.address, parseEther("100"));

        await vaultV1.connect(alice).deposit(parseEther("10"));
        await vaultV1.deposit(parseEther("100"));

        expect([
          await vaultV1.totalSupply(tokenOne.address),
          await vaultV1.balances(tokenOne.address, owner.address),
          await vaultV1.balances(tokenOne.address, alice.address),
        ]).to.deep.eq([parseEther("110"), parseEther("100"), parseEther("10")]);

        await expect(
          vaultV1.connect(alice).withdraw(tokenOne.address, parseEther("1"))
        )
          .to.emit(vaultV1, "Withdrawal")
          .withArgs(alice.address, tokenOne.address, parseEther("1"));

        await expect(vaultV1.withdraw(tokenOne.address, parseEther("10")))
          .to.emit(vaultV1, "Withdrawal")
          .withArgs(owner.address, tokenOne.address, parseEther("10"));

        expect([
          await vaultV1.totalSupply(tokenOne.address),
          await vaultV1.balances(tokenOne.address, owner.address),
          await vaultV1.balances(tokenOne.address, alice.address),
        ]).to.deep.eq([parseEther("99"), parseEther("90"), parseEther("9")]);
      });
    });

    describe("Change token functionality", () => {
      it("Non-owner cannot change token", async () => {
        await expect(
          vaultV1.connect(alice).changeToken(tokenTwo.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("Revert WrongAddress - address(0)", async () => {
        await expect(
          vaultV1.changeToken(constants.AddressZero)
        ).to.revertedWith(
          `WrongAddress("changeToken", "${constants.AddressZero}")`
        );
      });

      it("Revert WrongAddress - current token", async () => {
        await expect(vaultV1.changeToken(tokenOne.address)).to.revertedWith(
          `WrongAddress("changeToken", "${tokenOne.address}")`
        );
      });

      it("Change token", async () => {
        // deposit some old tokens
        await tokenOne.approve(vaultV1.address, parseEther("100"));
        await vaultV1.deposit(parseEther("100"));

        expect(await vaultV1.balances(tokenOne.address, owner.address)).to.eq(
          parseEther("100")
        );

        await expect(vaultV1.changeToken(tokenTwo.address))
          .to.emit(vaultV1, "TokenChanged")
          .withArgs(tokenOne.address, tokenTwo.address, parseEther("0.1"));

        expect([
          await vaultV1.token(), // new token
          await vaultV1.totalSupply(tokenOne.address), // total supply of the old token
        ]).to.deep.eq([tokenTwo.address, parseEther("100")]);

        // deposit new tokens and withdraw old
        await tokenTwo.approve(vaultV1.address, parseEther("100"));
        await expect(vaultV1.deposit(parseEther("100")))
          .to.emit(vaultV1, "Deposit")
          .withArgs(owner.address, tokenTwo.address, parseEther("100"));

        expect(await vaultV1.totalSupply(tokenTwo.address)).to.eq(
          parseEther("100")
        );

        await expect(() => vaultV1.withdraw(tokenOne.address, parseEther("10")))
          .to.emit(vaultV1, "Withdrawal")
          .withArgs(owner.address, tokenOne.address, parseEther("10"))
          .to.changeTokenBalance(tokenOne, owner, parseEther("10"));

        expect(await vaultV1.totalSupply(tokenOne.address)).to.eq(
          parseEther("90")
        );
      });
    });
  });

  describe("2 ver", () => {
    let tokenThree: Token;

    let implV2: VaultV2;

    let vaultV2: VaultV2;

    beforeEach(async () => {
      tokenThree = await new Token__factory(owner).deploy("TokenThree", "TKN3");
      await tokenThree.mint(owner.address, parseEther("1000"));
      await tokenThree.mint(alice.address, parseEther("1000"));

      // do some actions with vault ver 1
      await tokenOne.connect(alice).approve(vaultV1.address, parseEther("100"));
      await tokenTwo.connect(owner).approve(vaultV1.address, parseEther("100"));

      await vaultV1.connect(alice).deposit(parseEther("100"));

      await vaultV1.changeToken(tokenTwo.address);

      await vaultV1.connect(owner).deposit(parseEther("100"));

      await vaultV1.connect(alice).withdraw(tokenOne.address, parseEther("10"));
    });

    it("Ver 1 state", async () => {
      expect([
        await vaultV1.token(), // current token
        await vaultV1.totalSupply(tokenTwo.address), // totalSupply of TKN1
        await vaultV1.totalSupply(tokenOne.address), // totalSupply of TKN2
        await vaultV1.owner(), // contract's owner
      ]).to.deep.eq([
        tokenTwo.address,
        parseEther("100"),
        parseEther("90"),
        owner.address,
      ]);
    });

    it("Upgrade contract", async () => {
      implV2 = await new VaultV2__factory(owner).deploy();

      const TUProxy = new TransparentUpgradeableProxy__factory(owner).attach(
        proxy.address
      );

      await TUProxy.upgradeTo(implV2.address);

      vaultV2 = new VaultV2__factory(owner).attach(proxy.address);

      // Before the first execution of the `addToken` function
      expect([await vaultV2.token(), await vaultV2.minAmount()]).to.deep.eq([
        tokenTwo.address,
        parseEther("0.1"),
      ]);

      await expect(vaultV2.addToken(tokenOne.address))
        .to.emit(vaultV2, "TokenAdded")
        .withArgs(tokenTwo.address)
        .to.emit(vaultV2, "TokenAdded")
        .withArgs(tokenOne.address);

      expect([
        await vaultV2.name(), // contract's name
        await vaultV2.token(), // deprecated variable `token`
        await vaultV2.minAmount(), // deprecated variable `minAmount`
        await vaultV2.totalSupply(tokenTwo.address), // totalSupply of TKN1
        await vaultV2.totalSupply(tokenOne.address), // totalSupply of TKN2
        await vaultV2.assets(tokenOne.address), // support of TKN1
        await vaultV2.assets(tokenTwo.address), // support of TKN2
        await vaultV2.assets(tokenThree.address), // support of TKN3
      ]).to.deep.eq([
        "Vault",
        constants.AddressZero,
        constants.Zero,
        parseEther("100"),
        parseEther("90"),
        true,
        true,
        false,
      ]);
    });

    describe("VaultV2 functionality", () => {
      beforeEach(async () => {
        implV2 = await new VaultV2__factory(owner).deploy();

        const TUProxy = new TransparentUpgradeableProxy__factory(owner).attach(
          proxy.address
        );

        await TUProxy.upgradeTo(implV2.address);

        vaultV2 = new VaultV2__factory(owner).attach(proxy.address);

        await vaultV2.addToken(tokenOne.address);
      });

      describe("Add token function", () => {
        it("Non-owner cannot add new token", async () => {
          await expect(
            vaultV2.connect(alice).addToken(tokenOne.address)
          ).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert WrongAddress - address(0)", async () => {
          await expect(vaultV2.addToken(constants.AddressZero)).to.revertedWith(
            `WrongAddress("addToken", "${constants.AddressZero}")`
          );
        });

        it("Revert WrongAddress - already supported token", async () => {
          await expect(vaultV2.addToken(tokenOne.address)).to.revertedWith(
            `WrongAddress("addToken", "${tokenOne.address}")`
          );
        });

        it("Add tokenThree to supported tokens", async () => {
          await expect(vaultV2.addToken(tokenThree.address))
            .to.emit(vaultV2, "TokenAdded")
            .withArgs(tokenThree.address);

          expect(await vaultV2.assets(tokenThree.address)).to.eq(true);
        });
      });

      describe("previewDeposit's revert", () => {
        it("previewDeposit's revert", async () => {
          try {
            await vaultV2.previewDeposit(tokenThree.address, parseEther("0.1"));
          } catch (error: any) {
            expect(error.errorName).to.eq("WrongAddress");
            expect(error.errorArgs).to.deep.eq([
              "previewDeposit",
              tokenThree.address,
            ]);
          }
        });
      });

      describe("Deposit functionality", async () => {
        describe("Deposit", () => {
          it("Revert NotEnoughAmount", async () => {
            await expect(
              vaultV2.deposit(tokenOne.address, parseEther("0.01"))
            ).to.revertedWith(
              `NotEnoughAmount("deposit", ${parseEther("0.01")}, "${
                tokenOne.address
              }")`
            );
          });

          it("Revert WrongAddress - unsupported token", async () => {
            await expect(
              vaultV2.deposit(tokenThree.address, parseEther("0.1"))
            ).to.revertedWith(
              `WrongAddress("deposit", "${tokenThree.address}")`
            );
          });

          it("Deposit two different tokens", async () => {
            await tokenOne.approve(vaultV2.address, parseEther("100"));
            await tokenTwo
              .connect(alice)
              .approve(vaultV2.address, parseEther("100"));

            await expect(vaultV2.deposit(tokenOne.address, parseEther("100")))
              .to.emit(vaultV2, "Deposit")
              .withArgs(owner.address, tokenOne.address, parseEther("100"));

            await expect(
              vaultV2
                .connect(alice)
                .deposit(tokenTwo.address, parseEther("100"))
            )
              .to.emit(vaultV2, "Deposit")
              .withArgs(alice.address, tokenTwo.address, parseEther("100"));

            expect([
              await vaultV2.totalSupply(tokenOne.address),
              await vaultV2.totalSupply(tokenTwo.address),
              await vaultV2.balances(tokenOne.address, owner.address),
              await vaultV2.balances(tokenTwo.address, alice.address),
            ]).to.deep.eq([
              parseEther("190"), // balance before upgrade implementation + deposit
              parseEther("200"),
              parseEther("100"),
              parseEther("100"),
            ]);
          });

          it("Deposit token after adding support", async () => {
            await expect(vaultV2.addToken(tokenThree.address))
              .to.emit(vaultV2, "TokenAdded")
              .withArgs(tokenThree.address);

            await tokenThree.approve(vaultV2.address, parseEther("1000"));

            await expect(() =>
              vaultV2.deposit(tokenThree.address, parseEther("1000"))
            ).to.changeTokenBalance(tokenThree, vaultV2, parseEther("1000"));
          });
        });

        describe("Deposit by signature", () => {
          it("Revert NotEnoughAmount", async () => {
            // 20 minutes
            const deadline =
              (await ethers.provider.getBlock("latest")).timestamp + 1200;

            const signature = await signERC2612Permit(
              owner, // provider (signer)
              tokenOne.address, // token that supports permit functionality
              owner.address, // owner of token
              vaultV2.address, // spender
              parseEther("0.01").toString(), // value
              deadline
            );

            await expect(
              vaultV2.depositBySig(
                tokenOne.address,
                parseEther("0.01"),
                signature.deadline,
                signature.v,
                signature.r,
                signature.s
              )
            ).to.revertedWith(
              `NotEnoughAmount("deposit", ${parseEther("0.01")}, "${
                tokenOne.address
              }")`
            );
          });

          it("Revert WrongAddress - unsupported token", async () => {
            // 20 minutes
            const deadline =
              (await ethers.provider.getBlock("latest")).timestamp + 1200;

            const signature = await signERC2612Permit(
              owner, // provider (signer)
              tokenThree.address, // token that supports permit functionality
              owner.address, // owner of token
              vaultV2.address, // spender
              parseEther("100").toString(), // value
              deadline
            );

            await expect(
              vaultV2.depositBySig(
                tokenThree.address,
                parseEther("100"),
                signature.deadline,
                signature.v,
                signature.r,
                signature.s
              )
            ).to.revertedWith(
              `WrongAddress("deposit", "${tokenThree.address}")`
            );
          });

          it("Deposit two different tokens by signature", async () => {
            const deadline =
              (await ethers.provider.getBlock("latest")).timestamp + 1200;

            let signature = await signERC2612Permit(
              owner, // provider (signer)
              tokenOne.address, // token that supports permit functionality
              owner.address, // owner of token
              vaultV2.address, // spender
              parseEther("100").toString(), // value
              deadline
            );

            await expect(
              vaultV2.depositBySig(
                tokenOne.address,
                parseEther("100"),
                signature.deadline,
                signature.v,
                signature.r,
                signature.s
              )
            )
              .to.emit(vaultV2, "Deposit")
              .withArgs(owner.address, tokenOne.address, parseEther("100"));

            signature = await signERC2612Permit(
              alice, // provider (signer)
              tokenTwo.address, // token that supports permit functionality
              alice.address, // owner of token
              vaultV2.address, // spender
              parseEther("100").toString(), // value
              deadline
            );

            await expect(
              vaultV2
                .connect(alice)
                .depositBySig(
                  tokenTwo.address,
                  parseEther("100"),
                  signature.deadline,
                  signature.v,
                  signature.r,
                  signature.s
                )
            )
              .to.emit(vaultV2, "Deposit")
              .withArgs(alice.address, tokenTwo.address, parseEther("100"));

            expect([
              await vaultV2.totalSupply(tokenOne.address),
              await vaultV2.totalSupply(tokenTwo.address),
              await vaultV2.balances(tokenOne.address, owner.address),
              await vaultV2.balances(tokenTwo.address, alice.address),
            ]).to.deep.eq([
              parseEther("190"), // balance before upgrade implementation + deposit
              parseEther("200"),
              parseEther("100"),
              parseEther("100"),
            ]);
          });
        });

        describe("Withdraw functionality", () => {
          it("Revert NotEnoughAmount in withdraw function", async () => {
            expect(
              await vaultV2.balances(tokenTwo.address, alice.address)
            ).to.eq(constants.Zero);

            await expect(
              vaultV2.connect(alice).withdraw(tokenTwo.address, parseEther("1"))
            ).to.revertedWith(
              `NotEnoughAmount("withdraw", ${parseEther("1")}, "${
                tokenTwo.address
              }")`
            );
          });

          it("Revert NotEnoughAmount in withdraw function with unsupported token", async () => {
            await expect(
              vaultV2
                .connect(alice)
                .withdraw(tokenThree.address, parseEther("1"))
            ).to.revertedWith(
              `NotEnoughAmount("withdraw", ${parseEther("1")}, "${
                tokenThree.address
              }")`
            );
          });

          it("Success withdraw to two users", async () => {
            await expect(vaultV2.withdraw(tokenTwo.address, parseEther("1")))
              .to.emit(vaultV2, "Withdrawal")
              .withArgs(owner.address, tokenTwo.address, parseEther("1"));

            await expect(
              vaultV2
                .connect(alice)
                .withdraw(tokenOne.address, parseEther("10"))
            )
              .to.emit(vaultV2, "Withdrawal")
              .withArgs(alice.address, tokenOne.address, parseEther("10"));

            expect([
              await vaultV2.totalSupply(tokenOne.address),
              await vaultV2.totalSupply(tokenTwo.address),
              await vaultV2.balances(tokenTwo.address, owner.address),
              await vaultV2.balances(tokenOne.address, alice.address),
            ]).to.deep.eq([
              parseEther("80"),
              parseEther("99"),
              parseEther("99"),
              parseEther("80"),
            ]);
          });
        });
      });
    });
  });
});

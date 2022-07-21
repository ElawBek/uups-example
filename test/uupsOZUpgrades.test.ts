import { expect } from "chai";
import { upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { constants } from "ethers";
import { parseEther } from "ethers/lib/utils";

import {
  deployVersionOneUpgradesFixture,
  deployVersionTwoUpgradesFixture,
} from "./fixtures";

import { signERC2612Permit } from "eth-permit";

import {
  VaultV1,
  VaultV2,
  Token,
  VaultV2__factory,
  VaultV1__factory,
} from "../typechain-types";

describe("UUPS upgrades", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let token0: Token;
  let token1: Token;
  let token2: Token;

  let implV2: VaultV2;

  describe("1 ver", () => {
    let vaultV1Proxy: VaultV1;

    beforeEach(async () => {
      ({ owner, alice, token0, token1, vaultV1Proxy } = await loadFixture(
        deployVersionOneUpgradesFixture
      ));
    });

    describe("Deployment", () => {
      it("Proxy state", async () => {
        expect([
          await vaultV1Proxy.name(), // proxy name
          await vaultV1Proxy.token(), // current token
          await vaultV1Proxy.minAmount(), // minimum amount of token for deposit
          await vaultV1Proxy.totalSupply(token0.address), // totalSupply of current token
          await vaultV1Proxy.owner(), // contract's owner
        ]).to.deep.eq([
          "Vault",
          token0.address,
          parseEther("0.1"),
          constants.Zero,
          owner.address,
        ]);
      });

      it("Origin state", async () => {
        const impl = await upgrades.erc1967.getImplementationAddress(
          vaultV1Proxy.address
        );

        const originContract = new VaultV1__factory(owner).attach(impl);

        expect([
          await originContract.name(), // origin contract name
          await originContract.token(),
          await originContract.minAmount(),
          await originContract.owner(), // contract's owner
        ]).to.deep.eq([
          "",
          constants.AddressZero,
          constants.Zero,
          constants.AddressZero,
        ]);
      });

      it("Origin initialize revert", async () => {
        const impl = await upgrades.erc1967.getImplementationAddress(
          vaultV1Proxy.address
        );

        const originContract = new VaultV1__factory(owner).attach(impl);

        await expect(
          originContract.initialize(token0.address, "VaultError")
        ).to.revertedWith("Initializable: contract is already initialized");
      });
    });

    describe("Admin action #changeToken", () => {
      it("Ownable check", async () => {
        await expect(
          vaultV1Proxy.connect(alice).changeToken(token1.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("Attempt to change to the addressZero", async () => {
        await expect(
          vaultV1Proxy.connect(owner).changeToken(constants.AddressZero)
        )
          .to.revertedWithCustomError(vaultV1Proxy, "WrongAddress")
          .withArgs("changeToken", constants.AddressZero);
      });

      it("Attempt to change to the same token", async () => {
        await expect(vaultV1Proxy.connect(owner).changeToken(token0.address))
          .to.revertedWithCustomError(vaultV1Proxy, "WrongAddress")
          .withArgs("changeToken", token0.address);
      });

      it("Emit `TokenChanged` event", async () => {
        await expect(vaultV1Proxy.connect(owner).changeToken(token1.address))
          .to.emit(vaultV1Proxy, "TokenChanged")
          .withArgs(token0.address, token1.address, parseEther("0.1"));

        expect(await vaultV1Proxy.token()).to.eq(token1.address);
        expect(await vaultV1Proxy.minAmount()).to.eq(parseEther("0.1"));
      });
    });

    describe("#deposit", () => {
      it("Insufficient number of tokens should revert", async () => {
        await expect(vaultV1Proxy.connect(alice).deposit(42))
          .to.revertedWithCustomError(vaultV1Proxy, "NotEnoughAmount")
          .withArgs("deposit", 42);
      });

      it("Token transfer failed", async () => {
        await expect(
          vaultV1Proxy.connect(alice).deposit(parseEther("0.1"))
        ).to.revertedWith("ERC20: insufficient allowance");
      });

      it("Successful deposit and emit `Deposit` event", async () => {
        await expect(vaultV1Proxy.connect(owner).deposit(parseEther("10")))
          .to.emit(vaultV1Proxy, "Deposit")
          .withArgs(owner.address, token0.address, parseEther("10"));

        // State changes:
        expect(await vaultV1Proxy.totalSupply(token0.address)).to.eq(
          parseEther("10")
        );
        expect(
          await vaultV1Proxy.balances(token0.address, owner.address)
        ).to.eq(parseEther("10"));
      });
    });

    describe("#withdraw", () => {
      beforeEach(async () => {
        await vaultV1Proxy.connect(owner).deposit(parseEther("10"));
      });

      it("Insufficient user balance should revert", async () => {
        expect(
          await vaultV1Proxy.balances(token0.address, alice.address)
        ).to.eq(0);

        await expect(vaultV1Proxy.connect(alice).withdraw(token0.address, 42))
          .to.revertedWithCustomError(vaultV1Proxy, "NotEnoughAmount")
          .withArgs("withdraw", 42);
      });

      it("Successful withdraw emit `Withdrawal` event", async () => {
        await expect(
          vaultV1Proxy.connect(owner).withdraw(token0.address, parseEther("5"))
        )
          .to.emit(vaultV1Proxy, "Withdrawal")
          .withArgs(owner.address, token0.address, parseEther("5"));

        // State changes:
        expect(await vaultV1Proxy.totalSupply(token0.address)).to.eq(
          parseEther("5")
        );
        expect(
          await vaultV1Proxy.balances(token0.address, owner.address)
        ).to.eq(parseEther("5"));
      });

      it("Successful withdraw token0 after change token to token1", async () => {
        await vaultV1Proxy.connect(owner).changeToken(token1.address);

        await expect(
          vaultV1Proxy.connect(owner).withdraw(token0.address, parseEther("5"))
        )
          .to.emit(vaultV1Proxy, "Withdrawal")
          .withArgs(owner.address, token0.address, parseEther("5"));

        // State changes:
        expect(await vaultV1Proxy.totalSupply(token0.address)).to.eq(
          parseEther("5")
        );
        expect(
          await vaultV1Proxy.balances(token0.address, owner.address)
        ).to.eq(parseEther("5"));
      });
    });

    describe("Preview functions reverts", () => {
      it("#previewDeposit", async () => {
        await expect(
          vaultV1Proxy.connect(alice).previewDeposit(token1.address, 42)
        )
          .to.revertedWithCustomError(vaultV1Proxy, "WrongAddress")
          .withArgs("previewDeposit", token1.address);
      });

      it("#previewWithdraw", async () => {
        await expect(
          vaultV1Proxy.connect(alice).previewWithdraw(token0.address, 42)
        )
          .to.revertedWithCustomError(vaultV1Proxy, "NotEnoughAmount")
          .withArgs("previewWithdraw", 0);
      });
    });

    describe("#upgrade", () => {
      beforeEach(async () => {
        implV2 = await new VaultV2__factory(owner).deploy();
      });

      it("Ownable check", async () => {
        await expect(
          vaultV1Proxy.connect(alice).upgradeTo(implV2.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("Successful upgrade", async () => {
        const currentToken = await vaultV1Proxy.token();

        const data = implV2.interface.encodeFunctionData("addToken", [
          currentToken,
        ]);

        await vaultV1Proxy
          .connect(owner)
          .upgradeToAndCall(implV2.address, data);

        const v2 = new VaultV2__factory(owner).attach(vaultV1Proxy.address);

        expect([
          await v2.token(),
          await v2.minAmount(),
          await v2.assets(currentToken),
        ]).to.deep.eq([constants.AddressZero, constants.Zero, true]);
      });
    });
  });

  describe("2 ver", () => {
    let vaultV2Proxy: VaultV2;

    beforeEach(async () => {
      ({ owner, alice, token0, token1, token2, vaultV2Proxy } =
        await loadFixture(deployVersionTwoUpgradesFixture));
    });

    describe("Deployment", () => {
      it("New proxy state", async () => {
        expect([
          await vaultV2Proxy.owner(),
          await vaultV2Proxy.name(),
          await vaultV2Proxy.token(),
          await vaultV2Proxy.minAmount(),
          await vaultV2Proxy.assets(token1.address),
          await vaultV2Proxy.totalSupply(token0.address),
          await vaultV2Proxy.totalSupply(token1.address),
        ]).to.deep.eq([
          owner.address,
          "Vault",
          constants.AddressZero,
          constants.Zero,
          true,
          parseEther("150"),
          parseEther("50"),
        ]);
      });
    });

    describe("Owner actions #addToken", async () => {
      it("Ownable check", async () => {
        await expect(
          vaultV2Proxy.connect(alice).addToken(token0.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("New token is address zero", async () => {
        await expect(
          vaultV2Proxy.connect(owner).addToken(constants.AddressZero)
        )
          .to.revertedWithCustomError(vaultV2Proxy, "WrongAddress")
          .withArgs("addToken", constants.AddressZero);
      });

      it("New token is already supported", async () => {
        await expect(vaultV2Proxy.connect(owner).addToken(token1.address))
          .to.revertedWithCustomError(vaultV2Proxy, "WrongAddress")
          .withArgs("addToken", token1.address);
      });

      it("Emit `TokenAdded` event", async () => {
        await expect(vaultV2Proxy.connect(owner).addToken(token0.address))
          .to.emit(vaultV2Proxy, "TokenAdded")
          .withArgs(token0.address);

        expect(await vaultV2Proxy.assets(token0.address)).to.eq(true);
      });
    });

    describe("#deposit", async () => {
      beforeEach(async () => {
        await vaultV2Proxy.connect(owner).addToken(token0.address);
      });

      it("Attempt to deposit the unsupported token should revert", async () => {
        await expect(
          vaultV2Proxy.connect(alice).deposit(token2.address, parseEther("1"))
        )
          .to.revertedWithCustomError(vaultV2Proxy, "WrongAddress")
          .withArgs("deposit", token2.address);
      });

      it("Insufficient number of tokens should revert", async () => {
        await expect(vaultV2Proxy.connect(alice).deposit(token2.address, 42))
          .to.revertedWithCustomError(vaultV2Proxy, "NotEnoughAmount")
          .withArgs("deposit", 42, token2.address);
      });

      it("Transfer failed", async () => {
        await expect(
          vaultV2Proxy.connect(owner).deposit(token0.address, parseEther("1"))
        ).to.revertedWith("ERC20: insufficient allowance");
      });

      it("Can deposit both supported tokens", async () => {
        await expect(
          vaultV2Proxy.connect(alice).deposit(token0.address, parseEther("50"))
        )
          .to.emit(vaultV2Proxy, "Deposit")
          .withArgs(alice.address, token0.address, parseEther("50"));

        await expect(
          vaultV2Proxy.connect(alice).deposit(token1.address, parseEther("50"))
        )
          .to.emit(vaultV2Proxy, "Deposit")
          .withArgs(alice.address, token1.address, parseEther("50"));
      });
    });

    describe("#depositBySig", async () => {
      beforeEach(async () => {
        await vaultV2Proxy.connect(owner).addToken(token0.address);
      });

      it("Attempt to deposit the unsupported token should revert", async () => {
        const signature = await signERC2612Permit(
          alice,
          token2.address,
          alice.address,
          vaultV2Proxy.address,
          parseEther("1").toString()
        );

        await expect(
          vaultV2Proxy
            .connect(alice)
            .depositBySig(
              token2.address,
              parseEther("1"),
              signature.deadline,
              signature.v,
              signature.r,
              signature.s
            )
        )
          .to.revertedWithCustomError(vaultV2Proxy, "WrongAddress")
          .withArgs("deposit", token2.address);
      });

      it("Insufficient number of tokens should revert", async () => {
        const signature = await signERC2612Permit(
          alice,
          token2.address,
          alice.address,
          vaultV2Proxy.address,
          "42"
        );

        await expect(
          vaultV2Proxy
            .connect(alice)
            .depositBySig(
              token2.address,
              42,
              signature.deadline,
              signature.v,
              signature.r,
              signature.s
            )
        )
          .to.revertedWithCustomError(vaultV2Proxy, "NotEnoughAmount")
          .withArgs("deposit", 42, token2.address);
      });

      it("Transfer failed", async () => {
        const signature = await signERC2612Permit(
          owner,
          token0.address,
          owner.address,
          vaultV2Proxy.address,
          parseEther("1").toString()
        );

        await expect(
          vaultV2Proxy
            .connect(owner)
            .depositBySig(
              token0.address,
              parseEther("1"),
              signature.deadline,
              signature.v,
              signature.r,
              signature.s
            )
        ).to.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("Can deposit both supported tokens", async () => {
        let signature = await signERC2612Permit(
          alice,
          token0.address,
          alice.address,
          vaultV2Proxy.address,
          parseEther("50").toString()
        );

        await expect(
          vaultV2Proxy
            .connect(alice)
            .depositBySig(
              token0.address,
              parseEther("50"),
              signature.deadline,
              signature.v,
              signature.r,
              signature.s
            )
        )
          .to.emit(vaultV2Proxy, "Deposit")
          .withArgs(alice.address, token0.address, parseEther("50"));

        signature = await signERC2612Permit(
          alice,
          token1.address,
          alice.address,
          vaultV2Proxy.address,
          parseEther("50").toString()
        );

        await expect(
          vaultV2Proxy
            .connect(alice)
            .depositBySig(
              token1.address,
              parseEther("50"),
              signature.deadline,
              signature.v,
              signature.r,
              signature.s
            )
        )
          .to.emit(vaultV2Proxy, "Deposit")
          .withArgs(alice.address, token1.address, parseEther("50"));
      });
    });

    describe("#withdraw", async () => {
      it("Attempt to withdraw the unsupported token should revert, because its totalSupply is zero", async () => {
        await expect(
          vaultV2Proxy.connect(alice).withdraw(token2.address, parseEther("1"))
        )
          .to.revertedWithCustomError(vaultV2Proxy, "NotEnoughAmount")
          .withArgs("withdraw", parseEther("1"), token2.address);
      });

      it("Can withdraw both tokens", async () => {
        await expect(
          vaultV2Proxy.connect(alice).withdraw(token0.address, parseEther("50"))
        )
          .to.emit(vaultV2Proxy, "Withdraw")
          .withArgs(alice.address, token0.address, parseEther("50"))
          .to.changeTokenBalance(token0, alice, parseEther("50"));

        await expect(
          vaultV2Proxy.connect(alice).withdraw(token1.address, parseEther("50"))
        )
          .to.emit(vaultV2Proxy, "Withdraw")
          .withArgs(alice.address, token1.address, parseEther("50"))
          .to.changeTokenBalance(token1, alice, parseEther("50"));
      });
    });
  });
});

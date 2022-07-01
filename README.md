# Example of a Universal Upgradeable Proxy Standard

This is an implementation for [Universal Upgradeable Proxy Standard](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable)

# Installation

1. Clone tis repo:

```shell
git clone https://github.com/ElawBek/uups-example.git
```

2. Install NPM packages:

```shell
cd uups-example
npm install
```

# Deployment

localhost: (comment out the "verify:verify")

```shell
npx hardhat node
npx hardhat run scripts/deployV1.ts
npx hardhat run scripts/upgradeToV2.ts
```

custom network (testnets/mainnets):

```shell
npx hardhat run scripts/deployV1.ts --network yourNetwork
npx hardhat run scripts/upgradeToV2.ts --network yourNetwork
```

## How the scripts works

deployV1.ts:

1. deploy token contract (asset for vault)
2. mint 1000 tokens to signer (just for test)
3. deploy vaultV1 contract (implementation ver1)
4. deploy ERC1967Proxy contract with 2 args: implementation address and data for initialization of the contract through the proxy
5. deposit 100 tokens to vaultV1 contract through proxy
6. verify contracts on the scanner

deployV2.ts: (copy your token1 and proxy addresses from the scanner)

1. deploy the second token contract (asset for vault)
2. mint 1000 tokens to signer (just for test)
3. deploy the second version of the token contract (implementation ver2)
4. attach proxyAddress to TUP-factory and call .upgradeTo(implV2.address) method
5. attach proxyAddress to VaultV2\_\_factory and add token2 to the supported token
6. verify v2 impl on the scanner

# Run tests:

uups.test.ts:

```shell
npx hardhat test test/uups.test.ts
```

uupsOZUpgrades.test.ts:

```shell
npm run test
```

# Useful Links

1. [The transparent proxy pattern (Openzeppelin blog)](https://blog.openzeppelin.com/the-transparent-proxy-pattern/)
2. [EIP-1822: Universal Upgradeable Proxy Standard (UUPS)](https://eips.ethereum.org/EIPS/eip-1822)
3. [EIP-1967: Standard Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
4. [Using the UUPS proxy pattern to upgrade smart contracts](https://blog.logrocket.com/using-uups-proxy-pattern-upgrade-smart-contracts/)
5. [Universal upgradeable proxies (Openzeppelin blog)](https://blog.openzeppelin.com/the-state-of-smart-contract-upgrades/#universal-upgradeable-proxies)

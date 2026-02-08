import { createConfig, factory, rateLimit } from 'ponder';
import { Auction as AuctionABI } from './abis/Auction';
import { Factory as FactoryABI } from './abis/Factory';
import { parseAbiItem, http } from 'viem';

if (!process.env.RPC_URL || !process.env.FACTORY_ADDRESS) {
  throw new Error('Missing environment variables: RPC_URL, FACTORY_ADDRESS');
}

const chainId = Number(process.env.CHAIN_ID || '31337');
const startBlock = Number(process.env.START_BLOCK || '0');
const isLocal = chainId === 31337;
const rps = Number(process.env.RPC_MAX_RPS || (isLocal ? 50 : 5));

const transport = isLocal
  ? http(process.env.RPC_URL as string)
  : rateLimit(http(process.env.RPC_URL as string), { requestsPerSecond: rps, browser: false });

export default createConfig({
  chains: {
    local: {
      id: chainId,
      rpc: transport,
      disableCache: isLocal,
    },
  },
  contracts: {
    // Index the factory to capture AuctionCreated events
    AuctionFactory: {
      abi: FactoryABI,
      chain: 'local',
      address: process.env.FACTORY_ADDRESS as `0x${string}`,
      startBlock,
    },
    // Dynamically index all auctions deployed by the factory
    Auction: {
      abi: AuctionABI,
      chain: 'local',
      address: factory({
        address: process.env.FACTORY_ADDRESS as `0x${string}`,
        event: parseAbiItem(
          'event AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)',
        ),
        parameter: 'auction',
      }),
      startBlock,
    },
  },
});

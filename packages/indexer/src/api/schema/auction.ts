import { index, onchainTable, sql } from 'ponder';

// Top-level auction registry — one row per auction deployed by the factory
export const auction = onchainTable('auctions', (t) => ({
  id: t.text().primaryKey(), // auction contract address (lowercase)
  token: t.hex().notNull(),
  currency: t.hex().notNull(),
  amount: t.bigint().notNull(),
  startBlock: t.integer().notNull(),
  endBlock: t.integer().notNull(),
  claimBlock: t.integer().notNull(),
  totalSupply: t.bigint().notNull(),
  floorPrice: t.bigint().notNull(),
  tickSpacing: t.bigint().notNull(),
  validationHook: t.hex().notNull(),
  createdAt: t.integer().notNull(), // block number
  // Live state
  lastCheckpointedBlock: t.integer().notNull(),
  lastClearingPriceQ96: t.bigint().notNull(),
  currencyRaised: t.bigint().notNull(),
  totalCleared: t.bigint().notNull(),
  requiredCurrencyRaised: t.bigint().notNull(),
  cumulativeMps: t.integer().notNull(),
  remainingMps: t.bigint().notNull(),
  availableSupply: t.bigint().notNull(),
  currentStepMps: t.integer().notNull(),
  currentStepStartBlock: t.integer().notNull(),
  currentStepEndBlock: t.integer().notNull(),
  numBids: t.integer().notNull(),
  numBidders: t.integer().notNull(),
  totalBidAmount: t.bigint().notNull(),
  updatedAt: t.integer().notNull(),
}));

export const bid = onchainTable(
  'bids',
  (t) => ({
    id: t.text().primaryKey(), // `{auctionAddr}:{bidId}`
    auctionId: t.text().notNull(), // FK to auctions
    amount: t.bigint().notNull(),
    maxPriceQ96: t.bigint().notNull(),
    owner: t.hex().notNull(),
    startBlock: t.integer().notNull(),
    transactionHash: t.text().notNull(),
    tokensFilled: t.bigint().notNull(),
    amountFilled: t.bigint().notNull(),
    lastFullyFilledCheckpointBlock: t.integer().notNull(),
    outbidCheckpointBlock: t.integer(),
    exited: t.boolean().notNull(),
    exitedBlock: t.integer(),
    exitTransactionHash: t.text(),
    claimed: t.boolean().notNull(),
    claimedBlock: t.integer(),
    claimTransactionHash: t.text(),
    tokensClaimed: t.bigint().notNull(),
    amountRefunded: t.bigint().notNull(),
  }),
  (t) => ({
    auctionIndex: index().on(t.auctionId),
    ownerIndex: index().on(t.owner),
    startBlockIndex: index().on(t.startBlock),
    activeMaxPriceIndex: index('active_max_price_idx')
      .on(t.maxPriceQ96)
      .where(sql`${t.exited} = false`),
    notOutbidMaxPriceIndex: index('not_outbid_max_price_idx')
      .on(t.maxPriceQ96)
      .where(sql`${t.outbidCheckpointBlock} IS NULL`),
  }),
);

export const tick = onchainTable('ticks', (t) => ({
  id: t.text().primaryKey(), // `{auctionAddr}:{priceQ96}`
  auctionId: t.text().notNull(),
  priceQ96: t.bigint().notNull(),
  nextPriceQ96: t.bigint().notNull(),
  currencyDemand: t.bigint().notNull(),
  numBids: t.integer().notNull(),
}));

export const step = onchainTable('steps', (t) => ({
  id: t.text().primaryKey(), // `{auctionAddr}:{stepIndex}`
  auctionId: t.text().notNull(),
  startBlock: t.integer().notNull(),
  endBlock: t.integer().notNull(),
  mps: t.integer().notNull(),
}));

export const checkpoint = onchainTable('checkpoints', (t) => ({
  id: t.text().primaryKey(), // `{auctionAddr}:{blockNumber}`
  auctionId: t.text().notNull(),
  blockNumber: t.integer().notNull(),
  clearingPriceQ96: t.bigint().notNull(),
  // eslint-disable-next-line camelcase
  currencyRaisedAtClearingPriceQ96_X7: t.bigint().notNull(),
  cumulativeMps: t.integer().notNull(),
  cumulativeMpsPerPrice: t.bigint().notNull(),
}));

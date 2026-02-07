import { ponder } from 'ponder:registry';
import { Auction as AuctionABI } from '../abis/Auction';
import schema from 'ponder:schema';
import { FixedPoint96, MPS, q96ToWei } from './utils/auction-utils';
import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'ponder';
import { decodeAbiParameters } from 'viem';

// Helper: get auction address from event (lowercase for consistent IDs)
function auctionAddr(event: { log: { address: string } }): string {
  return event.log.address.toLowerCase();
}

// Helper: build a contract call config for a specific auction address
function auctionContract(address: string) {
  return {
    address: address as `0x${string}`,
    abi: AuctionABI,
  } as const;
}

// ---- Factory event: AuctionCreated ----
ponder.on('AuctionFactory:AuctionCreated', async ({ event, context }) => {
  const addr = event.args.auction.toLowerCase();
  console.time(`AuctionFactory:AuctionCreated-${addr}`);

  // Decode AuctionParameters from configData
  let currency = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  let validationHook = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  let startBlock = 0;
  let endBlock = 0;
  let claimBlock = 0;
  let floorPrice = 0n;
  let tickSpacing = 0n;
  try {
    const [params] = decodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { name: 'currency', type: 'address' },
            { name: 'tokensRecipient', type: 'address' },
            { name: 'fundsRecipient', type: 'address' },
            { name: 'startBlock', type: 'uint64' },
            { name: 'endBlock', type: 'uint64' },
            { name: 'claimBlock', type: 'uint64' },
            { name: 'tickSpacing', type: 'uint256' },
            { name: 'validationHook', type: 'address' },
            { name: 'floorPrice', type: 'uint256' },
            { name: 'requiredCurrencyRaised', type: 'uint128' },
            { name: 'auctionStepsData', type: 'bytes' },
          ],
        },
      ],
      event.args.configData,
    );
    currency = params.currency;
    validationHook = params.validationHook;
    startBlock = Number(params.startBlock);
    endBlock = Number(params.endBlock);
    claimBlock = Number(params.claimBlock);
    floorPrice = params.floorPrice;
    tickSpacing = params.tickSpacing;
  } catch {
    // configData decode failed — will be populated from contract reads in setup
  }

  await context.db.insert(schema.auction).values({
    id: addr,
    token: event.args.token,
    currency,
    amount: event.args.amount,
    startBlock,
    endBlock,
    claimBlock,
    totalSupply: 0n,
    floorPrice,
    tickSpacing,
    validationHook,
    createdAt: Number(event.block.number),
    lastCheckpointedBlock: 0,
    lastClearingPriceQ96: 0n,
    currencyRaised: 0n,
    totalCleared: 0n,
    requiredCurrencyRaised: 0n,
    cumulativeMps: 0,
    remainingMps: 0n,
    availableSupply: 0n,
    currentStepMps: 0,
    currentStepStartBlock: 0,
    currentStepEndBlock: 0,
    numBids: 0,
    numBidders: 0,
    totalBidAmount: 0n,
    updatedAt: Math.floor(Date.now() / 1000),
  });

  // Also read totalSupply from contract (set after onTokensReceived)
  // We do this in a try/catch in case tokens haven't been transferred yet
  try {
    const ac = auctionContract(addr);
    const totalSupply = await context.client.readContract({ ...ac, functionName: 'totalSupply' });
    if (totalSupply > 0n) {
      await context.db.update(schema.auction, { id: addr }).set({ totalSupply });
    }
  } catch {
    // totalSupply read failed - will be populated by ensureAuctionInitialized later
  }

  console.timeEnd(`AuctionFactory:AuctionCreated-${addr}`);
});

// Helper: ensure auction row has contract state populated
async function ensureAuctionInitialized(auctionId: string, context: any) {
  const existing = await context.db.find(schema.auction, { id: auctionId });
  if (!existing || existing.totalSupply > 0n) return; // already initialized

  const ac = auctionContract(auctionId);
  const [startBlock, endBlock, claimBlock, floorPrice, totalSupply, tickSpacing] = await Promise.all([
    context.client.readContract({ ...ac, functionName: 'startBlock' }),
    context.client.readContract({ ...ac, functionName: 'endBlock' }),
    context.client.readContract({ ...ac, functionName: 'claimBlock' }),
    context.client.readContract({ ...ac, functionName: 'floorPrice' }),
    context.client.readContract({ ...ac, functionName: 'totalSupply' }),
    context.client.readContract({ ...ac, functionName: 'tickSpacing' }),
  ]);

  await context.db.update(schema.auction, { id: auctionId }).set({
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
    claimBlock: Number(claimBlock),
    floorPrice,
    totalSupply,
    tickSpacing,
  });

  // Parse auction steps from SSTORE2
  const pointer = await context.client.readContract({ ...ac, functionName: 'pointer' });
  const code = await context.client.getCode({ address: pointer });
  if (code) {
    const data = code.slice(4); // slice off "0x00"
    const steps: { mps: number; startBlock: number; endBlock: number }[] = [];
    let stepStart = Number(startBlock);
    for (let i = 0; i < data.length; i += 16) {
      const chunk = data.slice(i, i + 16);
      if (chunk.length < 16) break;
      const mps = parseInt(chunk.slice(0, 6), 16);
      const blockDelta = parseInt(chunk.slice(6), 16);
      const stepEnd = stepStart + blockDelta;
      steps.push({ mps, startBlock: stepStart, endBlock: stepEnd });
      stepStart = stepEnd;
    }

    if (steps.length > 0) {
      await context.db.insert(schema.step).values(
        steps.map((s, idx) => ({
          id: `${auctionId}:${idx}`,
          auctionId,
          startBlock: s.startBlock,
          endBlock: s.endBlock,
          mps: s.mps,
        })),
      );
    }
  }
}

// ---- Auction events (scoped per auction via event.log.address) ----

ponder.on('Auction:AuctionStepRecorded', async ({ event, context }) => {
  const id = auctionAddr(event);
  console.time(`AuctionStepRecorded-${id}-${event.block.number}`);
  await ensureAuctionInitialized(id, context);

  await context.db.update(schema.auction, { id }).set({
    currentStepMps: event.args.mps,
    currentStepStartBlock: Number(event.args.startBlock),
    currentStepEndBlock: Number(event.args.endBlock),
    updatedAt: Math.floor(Date.now() / 1000),
  });
  console.timeEnd(`AuctionStepRecorded-${id}-${event.block.number}`);
});

ponder.on('Auction:TickInitialized', async ({ event, context }) => {
  const id = auctionAddr(event);
  console.time(`TickInitialized-${id}-${event.block.number}`);
  await ensureAuctionInitialized(id, context);

  await context.db.insert(schema.tick).values({
    id: `${id}:${BigInt(event.args.price).toString()}`,
    auctionId: id,
    priceQ96: event.args.price,
    nextPriceQ96: 0n,
    currencyDemand: 0n,
    numBids: 0,
  });
  console.timeEnd(`TickInitialized-${id}-${event.block.number}`);
});

ponder.on('Auction:BidSubmitted', async ({ event, context }) => {
  const id = auctionAddr(event);
  console.time(`BidSubmitted-${id}-${event.block.number}`);
  await ensureAuctionInitialized(id, context);
  const ac = auctionContract(id);

  const bidId = `${id}:${BigInt(event.args.id).toString()}`;

  await context.db.insert(schema.bid).values({
    id: bidId,
    auctionId: id,
    amount: event.args.amount,
    maxPriceQ96: event.args.price,
    owner: event.args.owner,
    tokensFilled: 0n,
    tokensClaimed: 0n,
    amountFilled: 0n,
    amountRefunded: 0n,
    exited: false,
    claimed: false,
    lastFullyFilledCheckpointBlock: Number(event.block.number),
    startBlock: Number(event.block.number),
    transactionHash: event.transaction.hash,
  });

  // Update tick
  const tickFromRPC = await context.client.readContract({
    ...ac,
    functionName: 'ticks',
    args: [BigInt(event.args.price)],
  });

  const tickId = `${id}:${BigInt(event.args.price).toString()}`;
  await context.db
    .insert(schema.tick)
    .values({
      id: tickId,
      auctionId: id,
      priceQ96: event.args.price,
      nextPriceQ96: tickFromRPC.next,
      currencyDemand: q96ToWei(tickFromRPC.currencyDemandQ96),
      numBids: 1,
    })
    .onConflictDoUpdate((row) => ({
      nextPriceQ96: tickFromRPC.next,
      currencyDemand: q96ToWei(tickFromRPC.currencyDemandQ96),
      numBids: row.numBids + 1,
    }));

  // Update previous tick
  const previousTick = await context.db.sql.query.tick.findFirst({
    where: (t, { lt: lt_, and: and_ }) => and_(lt_(t.priceQ96, event.args.price), eq(t.auctionId, id)),
    orderBy: (t, { desc: desc_ }) => [desc_(t.priceQ96)],
  });

  if (previousTick) {
    const prevTickFromRPC = await context.client.readContract({
      ...ac,
      functionName: 'ticks',
      args: [BigInt(previousTick.priceQ96)],
    });
    await context.db.update(schema.tick, { id: previousTick.id }).set({
      nextPriceQ96: prevTickFromRPC.next,
    });
  }

  // Update auction stats
  await context.db.sql
    .update(schema.auction)
    .set({
      numBids: sql`${schema.auction.numBids} + 1`,
      totalBidAmount: sql`${schema.auction.totalBidAmount} + ${event.args.amount}`,
      updatedAt: Math.floor(Date.now() / 1000),
      numBidders: sql`(SELECT COUNT(DISTINCT owner) FROM ${schema.bid} WHERE ${schema.bid.auctionId} = ${id})`,
    })
    .where(eq(schema.auction.id, id));

  console.timeEnd(`BidSubmitted-${id}-${event.block.number}`);
});

ponder.on('Auction:CheckpointUpdated', async ({ event, context }) => {
  const id = auctionAddr(event);
  console.time(`CheckpointUpdated-${id}-${event.block.number}`);
  await ensureAuctionInitialized(id, context);
  const ac = auctionContract(id);

  const checkPointFromRPC = await context.client.readContract({
    ...ac,
    functionName: 'checkpoints',
    args: [BigInt(event.args.blockNumber)],
  });

  const cp = {
    id: `${id}:${BigInt(event.args.blockNumber).toString()}`,
    auctionId: id,
    blockNumber: Number(event.args.blockNumber),
    clearingPriceQ96: event.args.clearingPrice,
    currencyRaisedAtClearingPriceQ96_X7: checkPointFromRPC.currencyRaisedAtClearingPriceQ96_X7,
    cumulativeMps: event.args.cumulativeMps,
    cumulativeMpsPerPrice: checkPointFromRPC.cumulativeMpsPerPrice,
  };

  await context.db.insert(schema.checkpoint).values(cp);

  // Read live totals
  const [totalClearedFromRPC, currencyRaisedFromRPC] = await Promise.all([
    context.client.readContract({ ...ac, functionName: 'totalCleared' }),
    context.client.readContract({ ...ac, functionName: 'currencyRaised' }),
  ]);

  const remainingMps = BigInt(MPS) - BigInt(cp.cumulativeMps);
  await context.db.sql
    .update(schema.auction)
    .set({
      cumulativeMps: cp.cumulativeMps,
      lastCheckpointedBlock: cp.blockNumber,
      lastClearingPriceQ96: cp.clearingPriceQ96,
      currencyRaised: currencyRaisedFromRPC,
      totalCleared: totalClearedFromRPC,
      remainingMps,
      availableSupply:
        remainingMps > 0n
          ? sql`${schema.auction.totalSupply} - (${schema.auction.totalSupply} / ${remainingMps})`
          : 0n,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(schema.auction.id, id));

  // ---- Update bids: fully filled ----
  const bidsFullyFilled = await context.db.sql
    .select()
    .from(schema.bid)
    .where(
      and(
        eq(schema.bid.auctionId, id),
        gt(schema.bid.maxPriceQ96, cp.clearingPriceQ96),
        eq(schema.bid.exited, false),
      ),
    );

  const bidsPartiallyFilled = await context.db.sql
    .select()
    .from(schema.bid)
    .where(
      and(
        eq(schema.bid.auctionId, id),
        eq(schema.bid.maxPriceQ96, cp.clearingPriceQ96),
        eq(schema.bid.exited, false),
        isNull(schema.bid.outbidCheckpointBlock),
      ),
    );

  let tickDemandQ96FromRPC = 0n;
  if (bidsPartiallyFilled.length > 0) {
    tickDemandQ96FromRPC = (
      await context.client.readContract({
        ...ac,
        functionName: 'ticks',
        args: [BigInt(cp.clearingPriceQ96)],
      })
    ).currencyDemandQ96;
  }

  // Cache checkpoints needed for bid calculations
  const allCpIds = new Set<string>();
  bidsFullyFilled.forEach((b) => allCpIds.add(`${id}:${b.startBlock.toString()}`));
  bidsPartiallyFilled.forEach((b) => allCpIds.add(`${id}:${b.startBlock.toString()}`));

  let cpMap = new Map<string, (typeof schema.checkpoint)['$inferSelect']>();
  if (allCpIds.size > 0) {
    const cps = await context.db.sql
      .select()
      .from(schema.checkpoint)
      .where(inArray(schema.checkpoint.id, Array.from(allCpIds)));
    cpMap = new Map(cps.map((c) => [c.id, c]));
  }

  // Fully filled updates
  const fullyFilledUpdates: { id: string; tokensFilled: bigint; amountFilled: bigint; lastBlock: number }[] = [];
  for (const b of bidsFullyFilled) {
    const bidCp = cpMap.get(`${id}:${b.startBlock.toString()}`);
    if (!bidCp) throw new Error(`Checkpoint not found for block ${b.startBlock} [bid ${b.id}]`);

    const mpsRemaining = MPS - BigInt(bidCp.cumulativeMps);
    const cumulativeMpsDelta = cp.cumulativeMps - bidCp.cumulativeMps;
    const cumulativeMpsPerPriceDelta = cp.cumulativeMpsPerPrice - bidCp.cumulativeMpsPerPrice;

    let currencySpent = 0n;
    const tokensFilled = (b.amount * cumulativeMpsPerPriceDelta) / BigInt(FixedPoint96.Q96 * mpsRemaining);
    if (tokensFilled != 0n) {
      currencySpent = (b.amount * BigInt(cumulativeMpsDelta)) / BigInt(mpsRemaining);
    }

    fullyFilledUpdates.push({ id: b.id, tokensFilled, amountFilled: currencySpent, lastBlock: cp.blockNumber });
  }

  // Partially filled updates
  const partialUpdates: { id: string; tokensFilled: bigint; amountFilled: bigint }[] = [];
  if (bidsPartiallyFilled.length > 0) {
    const [lastFullyCp] = await context.db.sql
      .select()
      .from(schema.checkpoint)
      .where(and(eq(schema.checkpoint.auctionId, id), lt(schema.checkpoint.clearingPriceQ96, cp.clearingPriceQ96)))
      .orderBy(desc(schema.checkpoint.blockNumber))
      .limit(1);

    if (!lastFullyCp) throw new Error('Last fully filled checkpoint not found');

    for (const b of bidsPartiallyFilled) {
      const bidCp = cpMap.get(`${id}:${b.startBlock.toString()}`);
      if (!bidCp) throw new Error(`Checkpoint not found for block ${b.startBlock} [bid ${b.id}]`);

      const mpsRemaining = MPS - BigInt(bidCp.cumulativeMps);
      const cumulativeMpsDelta = lastFullyCp.cumulativeMps - bidCp.cumulativeMps;
      const cumulativeMpsPerPriceDelta = lastFullyCp.cumulativeMpsPerPrice - bidCp.cumulativeMpsPerPrice;

      let currencySpent = 0n;
      let tokensFilled = (b.amount * cumulativeMpsPerPriceDelta) / BigInt(FixedPoint96.Q96 * mpsRemaining);
      if (tokensFilled != 0n) {
        currencySpent = (b.amount * BigInt(cumulativeMpsDelta)) / BigInt(mpsRemaining);
      }

      const denominator = tickDemandQ96FromRPC * BigInt(mpsRemaining);
      const partialCurrency =
        (b.amount * cp.currencyRaisedAtClearingPriceQ96_X7 + denominator - 1n) / denominator;
      const bidAmountQ96 = b.amount << FixedPoint96.RESOLUTION;
      const partialTokens =
        (bidAmountQ96 * cp.currencyRaisedAtClearingPriceQ96_X7) / denominator / b.maxPriceQ96;

      currencySpent += partialCurrency;
      tokensFilled += partialTokens;

      partialUpdates.push({ id: b.id, tokensFilled, amountFilled: currencySpent });
    }
  }

  // Batch update fully filled
  if (fullyFilledUpdates.length > 0) {
    const values = fullyFilledUpdates.map(
      (b) => sql`(${b.id}, ${b.tokensFilled}::numeric(78,0), ${b.amountFilled}::numeric(78,0), ${b.lastBlock}::numeric(78,0))`,
    );
    await context.db.sql.execute(sql`
      WITH bid_updates(id, tokens, amount, lastBlock) AS (
        VALUES ${sql.join(values, sql`, `)}
      )
      UPDATE ${schema.bid}
      SET tokens_filled = u.tokens, amount_filled = u.amount, last_fully_filled_checkpoint_block = u.lastBlock
      FROM bid_updates u
      WHERE ${schema.bid.id} = u.id
    `);
  }

  // Batch update partially filled
  if (partialUpdates.length > 0) {
    const values = partialUpdates.map(
      (b) => sql`(${b.id}, ${b.tokensFilled}::numeric(78,0), ${b.amountFilled}::numeric(78,0))`,
    );
    await context.db.sql.execute(sql`
      WITH bid_updates(id, tokens, amount) AS (
        VALUES ${sql.join(values, sql`, `)}
      )
      UPDATE ${schema.bid}
      SET tokens_filled = u.tokens, amount_filled = u.amount
      FROM bid_updates u
      WHERE ${schema.bid.id} = u.id
    `);
  }

  // Mark outbid bids
  await context.db.sql
    .update(schema.bid)
    .set({ outbidCheckpointBlock: cp.blockNumber })
    .where(
      and(
        eq(schema.bid.auctionId, id),
        lt(schema.bid.maxPriceQ96, cp.clearingPriceQ96),
        isNull(schema.bid.outbidCheckpointBlock),
      ),
    );

  console.timeEnd(`CheckpointUpdated-${id}-${event.block.number}`);
});

ponder.on('Auction:BidExited', async ({ event, context }) => {
  const id = auctionAddr(event);
  console.time(`BidExited-${id}-${event.block.number}`);

  const bidId = `${id}:${event.args.bidId.toString()}`;
  await context.db.update(schema.bid, { id: bidId }).set({
    exited: true,
    exitedBlock: Number(event.block.number),
    exitTransactionHash: event.transaction.hash,
    tokensFilled: event.args.tokensFilled,
    amountRefunded: event.args.currencyRefunded,
  });

  await context.db.sql
    .update(schema.auction)
    .set({
      totalBidAmount: sql`${schema.auction.totalBidAmount} - ${event.args.currencyRefunded}`,
    })
    .where(eq(schema.auction.id, id));

  console.timeEnd(`BidExited-${id}-${event.block.number}`);
});

ponder.on('Auction:TokensClaimed', async ({ event, context }) => {
  const id = auctionAddr(event);
  console.time(`TokensClaimed-${id}-${event.block.number}`);

  const bidId = `${id}:${BigInt(event.args.bidId).toString()}`;
  await context.db.update(schema.bid, { id: bidId }).set({
    claimed: true,
    claimedBlock: Number(event.block.number),
    claimTransactionHash: event.transaction.hash,
    tokensClaimed: event.args.tokensFilled,
    tokensFilled: event.args.tokensFilled,
  });

  console.timeEnd(`TokensClaimed-${id}-${event.block.number}`);
});

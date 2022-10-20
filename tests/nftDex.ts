import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { NftDex } from "../target/types/nft_dex";
import { createMint, TOKEN_PROGRAM_ID, mintTo, getAssociatedTokenAddress, createAssociatedTokenAccount } from '@solana/spl-token';

describe("nftDex", async () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.Provider.env());

    const program = anchor.workspace.NftDex as Program<NftDex>;
    let provider = anchor.Provider.env();
    const payer = anchor.web3.Keypair.generate();
    // Expiration DateTime
    let datetime = 24 * 3600 * 1000;
    let nftMint: anchor.web3.PublicKey;

    // offer_create_account , offer_supply_account , offer_demand_account are PDA accounts (https://solanacookbook.com/core-concepts/pdas.html#facts)
    // offer_create_account[0] = pda account address
    // offer_create_account[1] = nonce

    let offer_create_account = await anchor.web3.PublicKey.findProgramAddress(
        [
            program.programId.toBuffer(),
            anchor.utils.bytes.utf8.encode('offer_create')
        ], program.programId);
    let offer_supply_account = await anchor.web3.PublicKey.findProgramAddress(
        [
            program.programId.toBuffer(),
            anchor.utils.bytes.utf8.encode('offer_supply')
        ], program.programId);
    let offer_demand_account = await anchor.web3.PublicKey.findProgramAddress(
        [
            program.programId.toBuffer(),
            anchor.utils.bytes.utf8.encode('offer_demand')
        ], program.programId);

    it("CreateAccount Is initialized!", async () => {

        // Airdrop Sol to Payer Account.

        const airdropSignature = await provider.connection.requestAirdrop(
            payer.publicKey,
            anchor.web3.LAMPORTS_PER_SOL,
        );

        await provider.connection.confirmTransaction(airdropSignature);

        const accountInfo = await provider.connection.getAccountInfo(offer_create_account[0]);
        // offerCreate Account is already Initialized;
        if (accountInfo && accountInfo.data.length) {
            console.log("Accounts are already used! Format accounts...");
            const tx = await program.rpc.formatAccounts({
                accounts: {
                    offerCreate: offer_create_account[0],
                    offerSupply: offer_supply_account[0],
                    offerDemand: offer_demand_account[0],
                    owner: provider.wallet.publicKey
                }
            });
            console.log("Your transaction signature", tx);
            return;
        }

        const tx = await program.rpc.initializeCreateAccount(offer_create_account[1], {
            accounts: {
                offerCreate: offer_create_account[0],
                owner: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId
            }
        });
        console.log("Your transaction signature", tx);
    });
    it("SupplyAccount Is initialized!", async () => {

        const accountInfo = await provider.connection.getAccountInfo(offer_supply_account[0]);
        // offerSupply Account is already Initialized;
        if (accountInfo && accountInfo.data.length) return;

        const tx = await program.rpc.initializeSupplyAccount(offer_supply_account[1], {
            accounts: {
                offerSupply: offer_supply_account[0],
                owner: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId
            }
        });
        console.log("Your transaction signature", tx);
    });
    it("DemandAccount Is initialized!", async () => {

        const accountInfo = await provider.connection.getAccountInfo(offer_demand_account[0]);
        // offerDemand Account is already Initialized;
        if (accountInfo && accountInfo.data.length) return;

        const tx = await program.rpc.initializeDemandAccount(offer_demand_account[1], {
            accounts: {
                offerDemand: offer_demand_account[0],
                owner: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId
            }
        });
        console.log("Your transaction signature", tx);
    });
    
    // Offer 1 : supply 1, supply 3, demand 2
    // Offer 2 : supply 4, demand 1,
    // Offer 3 : supply 2, demand 3, demand 4

    // Offer 4 : supply 3, demand 2 
    // Offer 5 : supply 2, demand 4 
    const offers = [
        {
            nft_supply_ids: [
                new anchor.web3.PublicKey('9mFEkA7gLFLMRqbN9ZZNgnqVb9iY6ecZCdNgQ6zkMCzj'),
                new anchor.web3.PublicKey('4QZ3khRPradVxXKf3Q1LpKx38e5MPDDDEUvsR8ute2ic')
            ],
            nft_demand_ids: [new anchor.web3.PublicKey('23UZp2YBgNU3ThACMYbvJypbUrLm59vsFFeTrhkBAaPg')]
        },
        {
            nft_supply_ids: [new anchor.web3.PublicKey('BS3XrYVDzuwB5VirtUV9wYnr99H6FQwcnxTJewxh9K1p')],
            nft_demand_ids: [new anchor.web3.PublicKey('9mFEkA7gLFLMRqbN9ZZNgnqVb9iY6ecZCdNgQ6zkMCzj')]
        },
        {
            nft_supply_ids: [new anchor.web3.PublicKey('23UZp2YBgNU3ThACMYbvJypbUrLm59vsFFeTrhkBAaPg')],
            nft_demand_ids: [
                new anchor.web3.PublicKey('4QZ3khRPradVxXKf3Q1LpKx38e5MPDDDEUvsR8ute2ic'),
                new anchor.web3.PublicKey('BS3XrYVDzuwB5VirtUV9wYnr99H6FQwcnxTJewxh9K1p')
            ]
        },
        {
            nft_supply_ids: [new anchor.web3.PublicKey('4QZ3khRPradVxXKf3Q1LpKx38e5MPDDDEUvsR8ute2ic')],
            nft_demand_ids: [new anchor.web3.PublicKey('23UZp2YBgNU3ThACMYbvJypbUrLm59vsFFeTrhkBAaPg')]
        },
        {
            nft_supply_ids: [new anchor.web3.PublicKey('23UZp2YBgNU3ThACMYbvJypbUrLm59vsFFeTrhkBAaPg')],
            nft_demand_ids: [new anchor.web3.PublicKey('BS3XrYVDzuwB5VirtUV9wYnr99H6FQwcnxTJewxh9K1p')]
        },
    ];

    offers.map(function (offer, index) {

        it("Offer_" + (index + 1) + " Create", async () => {

            const mintAuthority = anchor.web3.Keypair.generate();
            const freezeAuthority = anchor.web3.Keypair.generate();

            nftMint = await createMint(
                provider.connection,
                payer,
                mintAuthority.publicKey,
                freezeAuthority.publicKey,
                9
            );
            // Crate NFT Token Account.
            const nftTokenAddress = await createAssociatedTokenAccount(
                provider.connection,
                payer,
                nftMint,
                provider.wallet.publicKey,

            );
            // Mint Token to NFT Token Account.
            await mintTo(
                provider.connection,
                payer,
                nftMint,
                nftTokenAddress,
                mintAuthority,
                1 // because decimals for the mint are set to 9 
            );

            if (index == 4) datetime -= 2 * 3600 * 1000;

            const tx = await program.rpc.offerCreate(new anchor.BN(datetime), offer.nft_supply_ids, offer.nft_demand_ids, {
                accounts: {
                    offerCreate: offer_create_account[0],
                    offerSupply: offer_supply_account[0],
                    offerDemand: offer_demand_account[0],
                    owner: provider.wallet.publicKey,
                    nftTokenAccount: nftTokenAddress,
                    nftMint: nftMint,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY
                }
            });
            console.log("Your transaction signature", tx);
        });
    })



    it("OfferDelete", async () => {

        const tx = await program.rpc.offerDelete(4, {
            accounts: {
                offerCreate: offer_create_account[0],
                offerSupply: offer_supply_account[0],
                offerDemand: offer_demand_account[0],
                owner: provider.wallet.publicKey
            }
        });
        console.log("Your transaction signature", tx);
    });

    it("OfferDeleteExp", async () => {

        const tx = await program.rpc.offerDeleteExp(new anchor.BN(datetime + 3600 * 1000), {
            accounts: {
                offerCreate: offer_create_account[0],
                offerSupply: offer_supply_account[0],
                offerDemand: offer_demand_account[0],
                owner: provider.wallet.publicKey,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY
            }
        });
        console.log("Your transaction signature", tx);
    });

    it("TradeCreate", async () => {

        const nftTokenAddress = await getAssociatedTokenAddress(
            nftMint,
            provider.wallet.publicKey
        );

        const tx = await program.rpc.tradeCreate([1, 2, 3], {
            accounts: {
                offerCreate: offer_create_account[0],
                offerSupply: offer_supply_account[0],
                offerDemand: offer_demand_account[0],
                owner: provider.wallet.publicKey,
                nftTokenAccount: nftTokenAddress,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY
            }
        });
        console.log("Your transaction signature", tx);
    });
});


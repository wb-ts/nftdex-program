import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { NftDex } from "../target/types/nft_dex";
import { createMint, TOKEN_PROGRAM_ID, mintTo, getAssociatedTokenAddress, createAssociatedTokenAccount } from '@solana/spl-token';

describe("nftDex", async () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.Provider.env());

    const program = anchor.workspace.NftDex as Program<NftDex>;
    let provider = anchor.Provider.env();
    // Expiration DateTime
    let datetime = new Date().getTime() + 10000;
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

        const accountInfo = await provider.connection.getAccountInfo(offer_create_account[0]);
        // offerCreate Account is already Initialized;
        if (accountInfo && accountInfo.data.length) return;

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


    it("OfferCreate", async () => {

        const nft_supply_id = '9mFEkA7gLFLMRqbN9ZZNgnqVb9iY6ecZCdNgQ6zkMCzj';
        const nft_demand_id = '23UZp2YBgNU3ThACMYbvJypbUrLm59vsFFeTrhkBAaPg';

        const payer = anchor.web3.Keypair.generate();
        const mintAuthority = anchor.web3.Keypair.generate();
        const freezeAuthority = anchor.web3.Keypair.generate();

        // Airdrop Sol to Payer Account.

        const airdropSignature = await provider.connection.requestAirdrop(
            payer.publicKey,
            anchor.web3.LAMPORTS_PER_SOL,
        );

        await provider.connection.confirmTransaction(airdropSignature);

        // Create Token

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

        const tx = await program.rpc.offerCreate(new anchor.BN(datetime), new anchor.web3.PublicKey(nft_supply_id), new anchor.web3.PublicKey(nft_demand_id), {
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

    it("OfferDelete", async () => {

        const tx = await program.rpc.offerDelete(1, {
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

        const tx = await program.rpc.offerDeleteExp(new anchor.BN(datetime), {
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

        const tx = await program.rpc.tradeCreate(1, {
            accounts: {
                offerCreate: offer_create_account[0],
                offerSupply: offer_supply_account[0],
                offerDemand: offer_demand_account[0],
                owner: provider.wallet.publicKey,
                nftTokenAccount: nftTokenAddress,
                tokenProgram: TOKEN_PROGRAM_ID
            }
        });
        console.log("Your transaction signature", tx);
    });
});


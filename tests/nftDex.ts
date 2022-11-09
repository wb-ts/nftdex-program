import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { NftDex } from "../target/types/nft_dex";
import { createMint, TOKEN_PROGRAM_ID, mintTo, getAssociatedTokenAddress, createAssociatedTokenAccount, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { Keypair, PublicKey, BPF_LOADER_PROGRAM_ID } from "@solana/web3.js";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import * as borsh from "@project-serum/borsh";
import { deserializeUnchecked, deserialize } from "borsh";
export * from './borsh';

const provider = anchor.Provider.env();

interface offerItemType {
    offer_account_address: PublicKey;
    owner: string;
    used_nfts: {
        nft_address: string;
        action: "supply" | "demand"
    }[];
    timestamp: number;
    created: number;
    expiration: number;
    bump: number;
}

const getOfferCreateAccounts = async (programId: PublicKey) => {

    let offers_list: offerItemType[] = [];

    const offer_create_accounts = await provider.connection.getProgramAccounts(
        programId,
        {
            dataSlice: {
                offset: 8,
                length: 409
            }
            ,
            filters: [
                {
                    dataSize: 417
                },
                {
                    memcmp: {
                        offset: 40,
                        bytes: programId.toBase58()
                    }
                }
            ]
        }
    );
    console.log("Offer Create Accounts:", offer_create_accounts.length);

    offer_create_accounts.forEach((account, i) => {

        const each_offer_create_account = account.account;

        class AccoundData {
            constructor(data) {
                Object.assign(this, data);
            }
        }

        const dataSchema = new Map([
            [
                AccoundData,
                {
                    kind: "struct",
                    fields: [
                        ["wallet_id", "Pubkey"],
                        ["owner", "Pubkey"],
                        ["supply_1", "Pubkey"],
                        ["supply_2", "Pubkey"],
                        ["supply_3", "Pubkey"],
                        ["supply_4", "Pubkey"],
                        ["supply_5", "Pubkey"],
                        ["demand_1", "Pubkey"],
                        ["demand_2", "Pubkey"],
                        ["demand_3", "Pubkey"],
                        ["demand_4", "Pubkey"],
                        ["demand_5", "Pubkey"],
                        ["timestamp", "u64"],
                        ["created", "u64"],
                        ["expiration", "u64"],
                        ["bump", "u8"]
                    ],
                },
            ],
        ]);

        const accountData = deserializeUnchecked(dataSchema, AccoundData, each_offer_create_account.data);

        let offerItem: offerItemType = {
            offer_account_address: account.pubkey,
            owner: accountData["wallet_id"].toBase58(),
            used_nfts: [],
            timestamp: Number(accountData["timestamp"]),
            created: Number(accountData["created"]),
            expiration: Number(accountData["expiration"]),
            bump: accountData["bump"]
        }

        if (accountData["supply_1"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["supply_1"].toString(),
            action: "supply"
        });
        if (accountData["supply_2"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["supply_2"].toString(),
            action: "supply"
        });
        if (accountData["supply_3"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["supply_3"].toString(),
            action: "supply"
        });
        if (accountData["supply_4"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["supply_4"].toString(),
            action: "supply"
        });
        if (accountData["supply_5"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["supply_5"].toString(),
            action: "supply"
        });
        if (accountData["demand_1"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["demand_1"].toString(),
            action: "demand"
        });
        if (accountData["demand_2"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["demand_2"].toString(),
            action: "demand"
        });
        if (accountData["demand_3"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["demand_3"].toString(),
            action: "demand"
        });
        if (accountData["demand_4"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["demand_4"].toString(),
            action: "demand"
        });
        if (accountData["demand_5"].toString() != programId.toBase58()) offerItem.used_nfts.push({
            nft_address: accountData["demand_5"].toString(),
            action: "demand"
        });

        offers_list.push(offerItem);
    });

    return offers_list;
};

describe("nftDex", async () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.Provider.env());
    const program = anchor.workspace.NftDex as Program<NftDex>;
    const payer = anchor.web3.Keypair.generate();
    // Expiration DateTime
    let datetime = 24 * 3600 * 1000;
    let nftMint: anchor.web3.PublicKey;

    const marketplace_account = await anchor.web3.PublicKey.findProgramAddress(
        [
            program.programId.toBuffer(),
            anchor.utils.bytes.utf8.encode('marketplace')
        ], program.programId);

    it("MarketplaceAccount Is initialized!", async () => {

        const accountInfo = await provider.connection.getAccountInfo(marketplace_account[0]);

        const airdropSignature = await provider.connection.requestAirdrop(
            payer.publicKey,
            anchor.web3.LAMPORTS_PER_SOL,
        );

        await provider.connection.confirmTransaction(airdropSignature);

        // Marketplace Account is already Initialized;
        if (accountInfo && accountInfo.data.length) return;

        const tx = await program.rpc.initializeMarketplaceAccount(marketplace_account[1], {
            accounts: {
                marketplace: marketplace_account[0],
                owner: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId
            }
        });
        console.log("Your transaction signature", tx);
    });

    let nft_addresses: anchor.web3.PublicKey[] = [];

    interface offerType {
        nft_supply_ids: anchor.web3.PublicKey[],
        nft_demand_ids: anchor.web3.PublicKey[],
        supply_user: anchor.web3.Keypair
    }

    let offers: offerType[] = [];

    const user_a_wallet = anchor.web3.Keypair.generate();
    const user_b_wallet = anchor.web3.Keypair.generate();
    const user_c_wallet = anchor.web3.Keypair.generate();

    const nftOwnUsers = [
        user_a_wallet,
        user_c_wallet,
        user_a_wallet,
        user_b_wallet,
        user_a_wallet,
    ];

    const mintAuthority = anchor.web3.Keypair.generate();
    const freezeAuthority = anchor.web3.Keypair.generate();

    it("Mint NFTs to Users.", async () => {

        for (let i = 0; i < nftOwnUsers.length; i++) {

            nftMint = await createMint(
                provider.connection,
                payer,
                mintAuthority.publicKey,
                freezeAuthority.publicKey,
                9
            );

            // nft_addresses = [...nft_addresses, nftMint];
            nft_addresses.push(nftMint)
            // Crate NFT Token Account.
            const nftTokenAddress = await createAssociatedTokenAccount(
                provider.connection,
                payer,
                nftMint,
                nftOwnUsers[i].publicKey,
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
        }

        if (nft_addresses.length) {
            // Offer 1 (user_a): supply 1, supply 3, demand 2
            // Offer 2 (user_b): supply 4, demand 1,
            // Offer 3 (user_c): supply 2, demand 3, demand 4

            // Offer 4 (user_a): supply 3, demand 2 
            // Offer 5 (user_c): supply 2, demand 4 

            offers = [
                {
                    nft_supply_ids: [nft_addresses[0], nft_addresses[2]],
                    nft_demand_ids: [nft_addresses[1]],
                    supply_user: user_a_wallet
                },
                {
                    nft_supply_ids: [nft_addresses[3]],
                    nft_demand_ids: [nft_addresses[0]],
                    supply_user: user_b_wallet
                },
                {
                    nft_supply_ids: [nft_addresses[1]],
                    nft_demand_ids: [nft_addresses[2], nft_addresses[3]],
                    supply_user: user_c_wallet
                },
                {
                    nft_supply_ids: [nft_addresses[2]],
                    nft_demand_ids: [nft_addresses[1]],
                    supply_user: user_a_wallet
                },
                {
                    nft_supply_ids: [nft_addresses[1]],
                    nft_demand_ids: [nft_addresses[3]],
                    supply_user: user_c_wallet
                },
            ];
            offers.forEach((offer) => {
                for (let i = 0; i < 5; i++) {
                    if (!offer.nft_supply_ids[i]) offer.nft_supply_ids[i] = program.programId;
                    if (!offer.nft_demand_ids[i]) offer.nft_demand_ids[i] = program.programId;
                }
            });

        }
    });

    it("SetActive", async () => {
        for (let i = 0; i < nft_addresses.length; i++) {
            const user_nft_token_address = await getAssociatedTokenAddress(
                nft_addresses[i],
                nftOwnUsers[i].publicKey
            );
            const tx = await program.rpc.setActive({
                accounts: {
                    marketplace: marketplace_account[0],
                    nftMint: nft_addresses[i],
                    userNftAccount: user_nft_token_address,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    owner: nftOwnUsers[i].publicKey,
                },
                signers: [
                    nftOwnUsers[i]
                ]
            });
            console.log("Set Active NFT_", nft_addresses[i].toBase58(), " Transaction:", tx);
        }
    });

    it("SetInactive", async () => {

        let user_nft_token_address: PublicKey;
        try {
            user_nft_token_address = await getAssociatedTokenAddress(
                nft_addresses[4],
                nftOwnUsers[4].publicKey
            );
        }
        catch (err) {
            throw (err);
        }
        const tx = await program.rpc.setInactive({
            accounts: {
                nftMint: nft_addresses[4],
                userNftAccount: user_nft_token_address,
                marketplace: marketplace_account[0],
                tokenProgram: TOKEN_PROGRAM_ID,
                owner: nftOwnUsers[4].publicKey
            }
        });
        console.log("Set Inactive NFT_", nft_addresses[4].toBase58(), " Transaction:", tx);

        const offers_list = await getOfferCreateAccounts(program.programId);

        let offersDeleteRelatedInactiveNFTsTransaction = new anchor.web3.Transaction();

        offers_list.forEach((offer: offerItemType, i) => {
            if (offer.used_nfts.find((nft) => nft.nft_address == nft_addresses[4].toBase58())) {
                offersDeleteRelatedInactiveNFTsTransaction.add(
                    program.instruction.offerDelete({
                        accounts: {
                            offerCreate: offer.offer_account_address,
                            payer: provider.wallet.publicKey
                        }
                    })
                );
            }
        });

        const delete_offers_tx = await provider.send(offersDeleteRelatedInactiveNFTsTransaction);

        console.log("Offers related to inactive NFTs were Deleted! tx:", delete_offers_tx);
    });

    it("OfferCreate!", async () => {

        const accounts = await provider.connection.getParsedProgramAccounts(
            TOKEN_PROGRAM_ID,
            {
                filters: [
                    {
                        dataSize: 165
                    },
                    {
                        memcmp: {
                            offset: 32,
                            bytes: marketplace_account[0].toBase58()
                        }
                    }
                ]
            }
        );

        let nfts_in_marketplace: string[] = [];

        accounts.forEach((account, i) => {
            nfts_in_marketplace.push(account.account.data["parsed"]["info"]["mint"]);
        });

        let nfts_activated: boolean = true;

        for (let i = 0; i < offers.length; i++) {

            // let offer_create_account = Keypair.generate();
            // let offer_supply_account = Keypair.generate();;
            // let offer_demand_account = Keypair.generate();;

            offers[i].nft_supply_ids.forEach((supply_nft) => {
                if (supply_nft != program.programId && !nfts_in_marketplace.find((nft_in_marketplace) => nft_in_marketplace == supply_nft.toBase58())) {
                    console.log(`NFT ${supply_nft} was not activated for supply! Please set active`);
                    nfts_activated = false;
                }
            });

            offers[i].nft_demand_ids.forEach((demand_nft) => {
                if (demand_nft != program.programId && !nfts_in_marketplace.find((nft_in_marketplace) => nft_in_marketplace == demand_nft.toBase58())) {
                    console.log(`NFT ${demand_nft} was not activated for demand! Please set active`);
                    nfts_activated = false;
                }
            });


            let current_timestamp = new Date().getTime();

            let offer_create_account = await anchor.web3.PublicKey.findProgramAddress(
                [
                    program.programId.toBuffer(),
                    anchor.utils.bytes.utf8.encode('offer_create'),
                    anchor.utils.bytes.utf8.encode(current_timestamp.toString())
                ], program.programId);

            if (!nfts_activated) {
                console.log("NFTs were not activated! Please active NFTs before creating offer!");
                break;
            }
            if (i == 4) datetime -= 2 * 3600 * 1000;

            console.log("current_timestamp:", current_timestamp, offers[i].supply_user.publicKey.toBase58());


            const tx = await program.rpc.offerCreate(
                new anchor.BN(datetime),
                new anchor.BN(current_timestamp),
                offers[i].nft_supply_ids,
                offers[i].nft_demand_ids,
                offer_create_account[1],
                {
                    accounts: {
                        offerCreate: offer_create_account[0],
                        owner: offers[i].supply_user.publicKey,
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                        payer: provider.wallet.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId
                    }
                }
            );
            console.log("Offer_", (i + 1), " Successed! Transaction signature", tx);

        }

    });

    it("OfferDelete", async () => {

        const offers_list = await getOfferCreateAccounts(program.programId);

        const tx = await program.rpc.offerDelete({
            accounts: {
                offerCreate: offers_list[4].offer_account_address,
                payer: provider.wallet.publicKey
            }
        });
        console.log("Successed! tx:", tx);
    });

    it("OfferDeleteExp", async () => {

        const offers_list = await getOfferCreateAccounts(program.programId);

        offers_list.forEach(async (offer, i) => {
            if (offer.expiration < datetime + 3600 * 1000) {
                const tx = await program.rpc.offerDelete({
                    accounts: {
                        offerCreate: offers_list[4].offer_account_address,
                        payer: provider.wallet.publicKey
                    }
                });
                console.log("Successed! tx:", tx);
            }
        });
    });


    it("TradeCreate", async () => {

        const offers_list = await getOfferCreateAccounts(program.programId);

        let supply_nfts = [], demand_nfts = [];

        // Offer 1 , 2 , 3

        for (let i = 0; i < 3; i++) {
            supply_nfts = [...supply_nfts, { ...offers_list[i].used_nfts.filter((nftObj) => nftObj.action == "supply"), owner: offers_list[i].owner }];
            demand_nfts = [...demand_nfts, { ...offers_list[i].used_nfts.filter((nftObj) => nftObj.action == "demand"), owner: offers_list[i].owner }];
        }

        if (demand_nfts.length != supply_nfts.length) {
            console.log("Supply and Demand NFTs count are different!");
            return;
        }
        supply_nfts.forEach((nftObj, i) => {
            const demand_nftObj = demand_nfts.filter((demand_nftObj) => demand_nftObj.nft_address == nftObj.nft_address);
            supply_nfts[i].newOwner = demand_nftObj[0].owner;
        })

        const transaction = new anchor.web3.Transaction();

        supply_nfts.forEach(async (nftObj) => {

            const user_nft_token_account = await getAssociatedTokenAddress(
                new anchor.web3.PublicKey(nftObj.nft_address),
                new anchor.web3.PublicKey(nftObj.owner)
            );

            const new_user_nft_token_account = await createAssociatedTokenAccount(
                provider.connection,
                payer,
                new anchor.web3.PublicKey(nftObj.nft_address),
                new anchor.web3.PublicKey(nftObj.newOwner),
            );

            transaction.add(
                program.instruction.traderCreate({
                    accounts: {
                        userNftAccount: user_nft_token_account,
                        newUserNftAccount: new_user_nft_token_account,
                        marketplace: marketplace_account[0],
                        nftMint: new anchor.web3.PublicKey(nftObj.nft_address),
                        tokenProgram: TOKEN_PROGRAM_ID
                    }
                })
            );

        });

        const tx = await provider.send(transaction);

        console.log("Trade Successed! tx:", tx);

        const transactionDeleteOffersTradeDone = new anchor.web3.Transaction();

        for (let i = 0; i < 3; i++) {
            transactionDeleteOffersTradeDone.add(
                program.instruction.offerDelete({
                    accounts: {
                        offerCreate: offers_list[i].offer_account_address,
                        payer: provider.wallet.publicKey
                    }
                })
            );
        }

        const tx1 = await provider.send(transactionDeleteOffersTradeDone);

        console.log("Offers Deleted! tx:", tx1);

    });
});
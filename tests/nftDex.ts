import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { NftDex } from "../target/types/nft_dex";
import { createMint, TOKEN_PROGRAM_ID, mintTo, getAssociatedTokenAddress, createAssociatedTokenAccount, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';

describe("nftDex", async () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.Provider.env());

    const program = anchor.workspace.NftDex as Program<NftDex>;
    const payer = anchor.web3.Keypair.generate();
    let provider = anchor.Provider.env();
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

    let marketplace_account = await anchor.web3.PublicKey.findProgramAddress(
        [
            program.programId.toBuffer(),
            anchor.utils.bytes.utf8.encode('marketplace')
        ], program.programId);

    let delegate_auctioner = await anchor.web3.PublicKey.findProgramAddress(
        [
            program.programId.toBuffer(),
            anchor.utils.bytes.utf8.encode('delegate_auctioner')
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
                    marketplace: marketplace_account[0],
                    owner: provider.wallet.publicKey
                }
            });
            console.log("Your transaction signature", tx);
            return;
        };

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

    it("MarketplaceAccount Is initialized!", async () => {

        const accountInfo = await provider.connection.getAccountInfo(marketplace_account[0]);
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
        }
    });

    it("SetActive", async () => {
        for (let i = 0; i < nft_addresses.length; i++) {
            const user_nft_token_address = await getAssociatedTokenAddress(
                nft_addresses[i],
                nftOwnUsers[i].publicKey
            );
            const tx = await program.rpc.setActive(nft_addresses[i], {
                accounts: {
                    marketplace: marketplace_account[0],
                    nftMint: nft_addresses[i],
                    userNftTokenAccount: user_nft_token_address,
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
        const user_nft_token_address = await getAssociatedTokenAddress(
            nft_addresses[4],
            nftOwnUsers[4].publicKey
        );
        const tx = await program.rpc.setInactive(nft_addresses[4], {
            accounts: {
                offerCreate: offer_create_account[0],
                offerSupply: offer_supply_account[0],
                offerDemand: offer_demand_account[0],
                marketplace: marketplace_account[0],
                nftMint: nft_addresses[4],
                userNftTokenAccount: user_nft_token_address,
                tokenProgram: TOKEN_PROGRAM_ID,
                owner: nftOwnUsers[4].publicKey,
            },
            signers: [
                nftOwnUsers[4]
            ]
        });
        console.log("Set Inactive NFT_", nft_addresses[4].toBase58(), " Transaction:", tx);
    });

    it("OfferCreate!", async () => {

        for (let i = 0; i < offers.length; i++) {
            if (i == 4) datetime -= 2 * 3600 * 1000;

            const tx = await program.rpc.offerCreate(new anchor.BN(datetime), offers[i].nft_supply_ids, offers[i].nft_demand_ids, {
                accounts: {
                    offerCreate: offer_create_account[0],
                    offerSupply: offer_supply_account[0],
                    offerDemand: offer_demand_account[0],
                    marketplace: marketplace_account[0],
                    owner: offers[i].supply_user.publicKey,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY
                },
                signers: [
                    offers[i].supply_user
                ]
            });
            console.log("Offer_", (i + 1), " Successed! Transaction signature", tx);
        }
    });

    it("OfferDelete", async () => {

        const tx = await program.rpc.offerDelete([4], {
            accounts: {
                offerCreate: offer_create_account[0],
                offerSupply: offer_supply_account[0],
                offerDemand: offer_demand_account[0],
                owner: user_a_wallet.publicKey
            },
            signers: [
                user_a_wallet
            ]
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
        const offer_ids = [1, 2, 3];
        try {
            const tx_validate = await program.rpc.tradeCreateValidate(offer_ids, {
                accounts: {
                    offerCreate: offer_create_account[0],
                    offerSupply: offer_supply_account[0],
                    offerDemand: offer_demand_account[0],
                    owner: provider.wallet.publicKey,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY
                }
            });

            console.log("Validate Transaction: ", tx_validate);

            interface transferNftsType {
                nft_id: anchor.web3.PublicKey,
                supply_user_wallet: anchor.web3.Keypair,
                demand_user_wallet: anchor.web3.Keypair
            }

            let transfer_nfts: transferNftsType[] = [];

            const transaction = new anchor.web3.Transaction();

            for (let i = 0; i < offer_ids.length; i++) {
                for (let demand_nft_index = 0; demand_nft_index < offers[offer_ids[i] - 1].nft_demand_ids.length; demand_nft_index++) {
                    let supply_user_wallet: anchor.web3.Keypair;
                    for (let j = 0; j < offer_ids.length; j++) {
                        for (let supply_nft_index = 0; supply_nft_index < offers[offer_ids[j] - 1].nft_supply_ids.length; supply_nft_index++) {
                            if (offers[offer_ids[j] - 1].nft_supply_ids[supply_nft_index] === offers[offer_ids[i] - 1].nft_demand_ids[demand_nft_index]) supply_user_wallet = offers[offer_ids[j] - 1].supply_user;
                        }
                    }
                    transfer_nfts = [...transfer_nfts, {
                        nft_id: offers[offer_ids[i] - 1].nft_demand_ids[demand_nft_index],
                        supply_user_wallet: supply_user_wallet,
                        demand_user_wallet: offers[offer_ids[i] - 1].supply_user,

                    }];
                };
            }

            for (let i = 0; i < transfer_nfts.length; i++) {

                const user_nft_token_address = await getAssociatedTokenAddress(
                    transfer_nfts[i].nft_id,
                    transfer_nfts[i].supply_user_wallet.publicKey
                );

                transaction.add(
                    program.instruction.transferNft(transfer_nfts[i].nft_id, {
                        accounts: {
                            offerDemand: offer_demand_account[0],
                            nftMint: transfer_nfts[i].nft_id,
                            userNftTokenAccount: user_nft_token_address,
                            tokenProgram: TOKEN_PROGRAM_ID,
                            demandUser: transfer_nfts[i].demand_user_wallet.publicKey,
                            marketplace: marketplace_account[0],
                            owner: provider.wallet.publicKey
                        }
                    })
                );
            }
            
            const tx = await program.provider.send(transaction);

            console.log("Transfer_NFTs Transaction Signature: ", tx);
            

        }
        catch (err) {
            throw err;
        }

    });
});


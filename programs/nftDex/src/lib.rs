use anchor_lang::prelude::*;

pub mod error;
pub mod state;

use error::*;
use state::*;

use anchor_spl::token::{self, Mint, SetAuthority, Token, TokenAccount};
use spl_token::instruction::AuthorityType;

const OFFER_CREATE_PREFIX: &[u8] = b"offer_create";
const OFFER_SUPPLY_PREFIX: &[u8] = b"offer_supply";
const OFFER_DEMAND_PREFIX: &[u8] = b"offer_demand";
const MARKETPLACE_PREFIX: &[u8] = b"marketplace";

declare_id!("6YcHjsGZnTZqd7A2SeyvjBNJ5BNADBvLVuxV2yo1Nu3T");

#[program]
pub mod nft_dex {
    use super::*;

    pub fn initialize_create_account(
        ctx: Context<InitializeCreateAccount>,
        offer_bump: u8,
    ) -> Result<()> {
        let owner = &mut ctx.accounts.owner;
        let offer_create = &mut ctx.accounts.offer_create;

        offer_create.owner = owner.to_account_info().key();
        offer_create.bump = offer_bump;
        offer_create.index = 0;

        Ok(())
    }

    pub fn initialize_supply_account(
        ctx: Context<InitializeSupplyAccount>,
        offer_bump: u8,
    ) -> Result<()> {
        let owner = &mut ctx.accounts.owner;
        let offer_supply = &mut ctx.accounts.offer_supply;

        offer_supply.owner = owner.to_account_info().key();
        offer_supply.bump = offer_bump;

        Ok(())
    }

    pub fn initialize_demand_account(
        ctx: Context<InitializeDemandAccount>,
        offer_bump: u8,
    ) -> Result<()> {
        let owner = &mut ctx.accounts.owner;
        let offer_demand = &mut ctx.accounts.offer_demand;

        offer_demand.owner = owner.to_account_info().key();
        offer_demand.bump = offer_bump;

        Ok(())
    }

    pub fn initialize_marketplace_account(
        ctx: Context<InitializeMarketplaceAccount>,
        marketplace_bump: u8,
    ) -> Result<()> {
        let owner = &mut ctx.accounts.owner;
        let marketplace = &mut ctx.accounts.marketplace;

        marketplace.owner = owner.to_account_info().key();
        marketplace.bump = marketplace_bump;

        Ok(())
    }

    pub fn format_accounts(ctx: Context<FormatAccounts>) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let offer_supply = &mut ctx.accounts.offer_supply;
        let offer_demand = &mut ctx.accounts.offer_demand;
        let marketplace = &mut ctx.accounts.marketplace;
        let signer = &mut ctx.accounts.owner;

        if signer.to_account_info().key() != offer_create.owner {
            return Err(NFTDEXError::OfferNotOwner.into());
        }

        offer_create.offers = [].to_vec();
        marketplace.items = [].to_vec();
        offer_create.index = 0;
        offer_supply.offers = [].to_vec();
        offer_demand.offers = [].to_vec();

        Ok(())
    }

    pub fn set_active(ctx: Context<SetActiveNFT>, nft_id: Pubkey) -> Result<()> {
        let marketplace = &mut ctx.accounts.marketplace;
        let user_nft_token_account = &mut ctx.accounts.user_nft_token_account;
        let owner = &mut ctx.accounts.owner;
        let token_program = &mut ctx.accounts.token_program;

        let marketplace_item = MarketplaceItem {
            nft_id,
            owner: owner.key(),
        };

        marketplace.items.push(marketplace_item);

        //transfer nft ownership to vault
        let authority_accounts = SetAuthority {
            current_authority: owner.to_account_info(),
            account_or_mint: user_nft_token_account.to_account_info(),
        };

        let authority_ctx = CpiContext::new(token_program.to_account_info(), authority_accounts);
        token::set_authority(
            authority_ctx,
            AuthorityType::AccountOwner,
            Some(marketplace.key()),
        )?;

        Ok(())
    }

    pub fn set_inactive(ctx: Context<SetInactiveNFT>, nft_id: Pubkey) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let offer_supply = &mut ctx.accounts.offer_supply;
        let offer_demand = &mut ctx.accounts.offer_demand;
        let marketplace = &mut ctx.accounts.marketplace;
        let user_nft_token_account = &mut ctx.accounts.user_nft_token_account;
        let owner = &mut ctx.accounts.owner;
        let token_program = &mut ctx.accounts.token_program;

        let mut flag: bool = true;

        if marketplace
            .items
            .iter()
            .any(|item| item.nft_id == nft_id && item.owner == owner.key())
        {
            flag = false;
        }

        if flag {
            return Err(NFTDEXError::NFTNotExist.into());
        }

        marketplace.items.retain(|x| x.nft_id != nft_id);

        let marketplace_account_seeds =
            &[&id().to_bytes(), MARKETPLACE_PREFIX, &[marketplace.bump]];

        let marketplace_account_signer = &[&marketplace_account_seeds[..]];

        let authority_accounts = SetAuthority {
            current_authority: marketplace.to_account_info(),
            account_or_mint: user_nft_token_account.to_account_info(),
        };

        let authority_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            authority_accounts,
            marketplace_account_signer,
        );
        token::set_authority(
            authority_ctx,
            AuthorityType::AccountOwner,
            Some(owner.key()),
        )?;

        for offer_supply_item in offer_supply.offers.iter() {
            if offer_supply_item.nft_id == nft_id {
                offer_create
                    .offers
                    .retain(|x| x.offer_id != offer_supply_item.offer_id);
            }
        }
        for offer_demand_item in offer_demand.offers.iter() {
            if offer_demand_item.nft_id == nft_id {
                offer_create
                    .offers
                    .retain(|x| x.offer_id != offer_demand_item.offer_id);
            }
        }
        offer_supply.offers.retain(|x| x.nft_id != nft_id);
        offer_demand.offers.retain(|x| x.nft_id != nft_id);

        Ok(())
    }

    pub fn offer_create(
        ctx: Context<OfferCreate>,
        datetime: i64,
        nft_supply_ids: Vec<Pubkey>,
        nft_demand_ids: Vec<Pubkey>,
    ) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let offer_supply = &mut ctx.accounts.offer_supply;
        let offer_demand = &mut ctx.accounts.offer_demand;
        let marketplace = &mut ctx.accounts.marketplace;
        let owner = &mut ctx.accounts.owner;
        let clock = &ctx.accounts.clock;

        for nft_id in &nft_supply_ids {
            let mut flag: bool = true;
            if marketplace.items.iter().any(|item| item.nft_id == *nft_id) {
                flag = false;
            }
            if flag {
                return Err(NFTDEXError::NFTNotExist.into());
            }
        }

        for nft_id in &nft_demand_ids {
            let mut flag: bool = true;
            if marketplace.items.iter().any(|item| item.nft_id == *nft_id) {
                flag = false;
            }
            if flag {
                return Err(NFTDEXError::NFTNotExist.into());
            }
        }

        let index: u32 = offer_create.index + 1;

        let offer_item = OfferItem {
            offer_id: index,
            creator: owner.to_account_info().key(),
            created: clock.unix_timestamp,
            expiration: datetime,
        };

        offer_create.offers.push(offer_item);
        offer_create.index = index;

        for nft_supply_id in nft_supply_ids.iter() {
            let offer_supply_item = OfferSupplyItem {
                offer_id: index,
                nft_id: *nft_supply_id,
            };
            offer_supply.offers.push(offer_supply_item);
        }

        for nft_demand_id in nft_demand_ids.iter() {
            let offer_demand_item = OfferDemandItem {
                offer_id: index,
                nft_id: *nft_demand_id,
                owner: owner.to_account_info().key(),
            };
            offer_demand.offers.push(offer_demand_item);
        }

        Ok(())
    }

    pub fn offer_delete(ctx: Context<OfferDelete>, offer_ids: Vec<u32>) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let offer_supply = &mut ctx.accounts.offer_supply;
        let offer_demand = &mut ctx.accounts.offer_demand;
        let signer = &mut ctx.accounts.owner;

        for offer_item in offer_create.offers.iter() {
            if offer_ids
                .iter()
                .any(|&offer_id| offer_id == offer_item.offer_id)
            {
                if offer_item.creator != signer.to_account_info().key() {
                    return Err(NFTDEXError::OfferNotCreator.into());
                }
            }
        }

        for offer_id in offer_ids {
            offer_create.offers.retain(|x| x.offer_id != offer_id);
            offer_supply.offers.retain(|x| x.offer_id != offer_id);
            offer_demand.offers.retain(|x| x.offer_id != offer_id);
        }

        Ok(())
    }

    pub fn offer_delete_exp(ctx: Context<OfferDeleteExp>, expiration: i64) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let offer_supply = &mut ctx.accounts.offer_supply;
        let offer_demand = &mut ctx.accounts.offer_demand;
        let signer = &mut ctx.accounts.owner;

        if signer.to_account_info().key() != offer_create.owner {
            return Err(NFTDEXError::OfferNotOwner.into());
        }

        let mut keys = Vec::new();

        for offer_item in offer_create.offers.iter() {
            if offer_item.expiration < expiration {
                keys.push(offer_item.offer_id)
            }
        }
        if keys.len() > 0 {
            for key in keys.iter() {
                offer_create.offers.retain(|x| x.offer_id != *key);
                offer_supply.offers.retain(|x| x.offer_id != *key);
                offer_demand.offers.retain(|x| x.offer_id != *key);
            }
        }

        Ok(())
    }

    pub fn trade_create_validate(ctx: Context<TradeCreate>, offer_ids: Vec<u32>) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let offer_supply = &mut ctx.accounts.offer_supply;
        let offer_demand = &mut ctx.accounts.offer_demand;
        let clock = &ctx.accounts.clock;

        let mut is_offer_exist_not_expired: bool = true;

        for offer_id in offer_ids.iter() {
            msg!("offer_id: {}", *offer_id);
            let mut flag: bool = false;
            for offer_item in offer_create.offers.iter_mut() {
                msg!("offer_item.offer_id: {}", offer_item.offer_id);
                if offer_item.offer_id == *offer_id {
                    flag = true;
                    if offer_item.created + offer_item.expiration < clock.unix_timestamp {
                        is_offer_exist_not_expired = false;
                        msg!("Offer is Expired!");
                    }
                }
            }
            if flag == false {
                is_offer_exist_not_expired = false;
                break;
            }
        }

        if is_offer_exist_not_expired == false {
            return Err(NFTDEXError::OfferIDORExpirationError.into());
        }

        let mut target_supply_items: Vec<&mut OfferSupplyItem> = Vec::new();
        let mut target_demand_items: Vec<&mut OfferDemandItem> = Vec::new();

        for offer_supply_item in offer_supply.offers.iter_mut() {
            if offer_ids.iter().any(|&i| i == offer_supply_item.offer_id) {
                target_supply_items.push(offer_supply_item);
            }
        }
        for offer_demand_item in offer_demand.offers.iter_mut() {
            if offer_ids.iter().any(|&i| i == offer_demand_item.offer_id) {
                target_demand_items.push(offer_demand_item);
            }
        }

        if target_supply_items.len() != target_demand_items.len() {
            return Err(NFTDEXError::OfferNotValidate.into());
        }

        for offer_supply_item in target_supply_items.iter_mut() {
            let mut flag: bool = false;
            for offer_demand_item in target_demand_items.iter_mut() {
                if offer_supply_item.nft_id == offer_demand_item.nft_id {
                    flag = true;
                }
            }
            if flag == false {
                return Err(NFTDEXError::OfferNotValidate.into());
            }
        }

        Ok(())
    }

    pub fn transfer_nft(ctx: Context<TransferNFT>, nft_id: Pubkey) -> Result<()> {
        let offer_demand = &mut ctx.accounts.offer_demand;
        let marketplace = &mut ctx.accounts.marketplace;
        let token_program = &mut ctx.accounts.token_program;
        let user_nft_token_account = &mut ctx.accounts.user_nft_token_account;
        let demand_user = &mut ctx.accounts.demand_user;
        let mut flag: bool = false;

        if offer_demand.offers.iter().any(|i| i.nft_id == nft_id) {
            flag = true;
        }

        if flag == false {
            return Err(NFTDEXError::NFTNotExist.into());
        }

        let marketplace_account_seeds =
            &[&id().to_bytes(), MARKETPLACE_PREFIX, &[marketplace.bump]];

        let marketplace_account_signer = &[&marketplace_account_seeds[..]];

        let authority_accounts = SetAuthority {
            current_authority: marketplace.to_account_info(),
            account_or_mint: user_nft_token_account.to_account_info(),
        };

        let authority_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            authority_accounts,
            marketplace_account_signer,
        );
        token::set_authority(
            authority_ctx,
            AuthorityType::AccountOwner,
            Some(demand_user.key()),
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bump:u8)]
pub struct InitializeCreateAccount<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump,
        space = 9000,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bump:u8)]
pub struct InitializeMarketplaceAccount<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [&id().to_bytes(),MARKETPLACE_PREFIX],
        bump,
        space = 9000,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bump:u8)]
pub struct InitializeSupplyAccount<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump,
        space = 9000,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bump:u8)]
pub struct InitializeDemandAccount<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump,
        space = 9000,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetActiveNFT<'info> {
    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(),MARKETPLACE_PREFIX],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    pub nft_mint: Box<Account<'info, Mint>>,

    /// CHECK:` doc comment explaining why no checks through types are necessary
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    /// The token account from the owner
    #[account(
        mut,
        has_one = owner @ NFTDEXError::InvalidNFTOwner,
        constraint = user_nft_token_account.mint == nft_mint.key() @ NFTDEXError::InvalidNFTAccountMint,
        constraint = user_nft_token_account.amount == 1 @ NFTDEXError::NFTAccountEmpty,
    )]
    pub user_nft_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetInactiveNFT<'info> {
    /// The offer account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump = offer_create.bump,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// The offer supply account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump = offer_supply.bump,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,
    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(),MARKETPLACE_PREFIX],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    pub nft_mint: Box<Account<'info, Mint>>,

    /// The token account from the owner
    #[account(
        mut,
        constraint = user_nft_token_account.mint == nft_mint.key() @ NFTDEXError::InvalidNFTAccountMint,
        constraint = user_nft_token_account.amount == 1 @ NFTDEXError::NFTAccountEmpty,
    )]
    pub user_nft_token_account: Account<'info, TokenAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferNFT<'info> {
    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(), MARKETPLACE_PREFIX],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer )]
    pub owner: AccountInfo<'info>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut)]
    pub demand_user: AccountInfo<'info>,

    pub nft_mint: Box<Account<'info, Mint>>,

    /// The token account from the owner
    #[account(mut)]
    pub user_nft_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct OfferCreate<'info> {
    /// The offer account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump = offer_create.bump,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// The offer supply account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump = offer_supply.bump,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(),MARKETPLACE_PREFIX],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]

pub struct OfferDelete<'info> {
    /// The offer account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump = offer_create.bump,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// The offer supply account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump = offer_supply.bump,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct OfferDeleteExp<'info> {
    /// The offer account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump = offer_create.bump,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// The offer supply account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump = offer_supply.bump,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct TradeCreate<'info> {
    /// The offer account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump = offer_create.bump,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// The offer supply account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump = offer_supply.bump,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct FormatAccounts<'info> {
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_CREATE_PREFIX],
        bump = offer_create.bump,
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// The offer supply account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_SUPPLY_PREFIX],
        bump = offer_supply.bump,
    )]
    pub offer_supply: Account<'info, OfferSupplyAccount>,

    /// The offer demand account
    #[account(
        mut,
        seeds = [&id().to_bytes(),OFFER_DEMAND_PREFIX],
        bump = offer_demand.bump,
    )]
    pub offer_demand: Account<'info, OfferDemandAccount>,

    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(),MARKETPLACE_PREFIX],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub owner: AccountInfo<'info>,
}
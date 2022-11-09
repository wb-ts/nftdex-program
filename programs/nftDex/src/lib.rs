use anchor_lang::prelude::*;

pub mod error;
pub mod state;

use error::*;
use state::*;

use anchor_spl::token::{self, Mint, SetAuthority, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

const MARKETPLACE_PREFIX: &[u8] = b"marketplace";
const OFFER_CREATE_ACCOUT_PREFIX: &[u8] = b"offer_create";

declare_id!("5v8VeEDzTYU6ESueJNwUMV3UGgTMmo4dDs19bNS1yDqb");

#[program]
pub mod nft_dex {
    use super::*;

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

    pub fn set_active(ctx: Context<SetActiveNFT>) -> Result<()> {
        let marketplace = &mut ctx.accounts.marketplace;
        let user_nft_account = &mut ctx.accounts.user_nft_account;
        let token_program = &mut ctx.accounts.token_program;
        let owner = &mut ctx.accounts.owner;

        let authority_accounts = SetAuthority {
            current_authority: owner.to_account_info(),
            account_or_mint: user_nft_account.to_account_info(),
        };

        let authority_ctx = CpiContext::new(token_program.to_account_info(), authority_accounts);
        token::set_authority(
            authority_ctx,
            AuthorityType::AccountOwner,
            Some(marketplace.key()),
        )?;

        Ok(())
    }

    pub fn set_inactive(ctx: Context<SetInactiveNFT>) -> Result<()> {
        let marketplace = &mut ctx.accounts.marketplace;
        let user_nft_account = &mut ctx.accounts.user_nft_account;
        let token_program = &mut ctx.accounts.token_program;
        let owner = &mut ctx.accounts.owner;

        let marketplace_account_seeds =
            &[&id().to_bytes(), MARKETPLACE_PREFIX, &[marketplace.bump]];

        let marketplace_account_signer = &[&marketplace_account_seeds[..]];

        let authority_accounts = SetAuthority {
            current_authority: marketplace.to_account_info(),
            account_or_mint: user_nft_account.to_account_info(),
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

        Ok(())
    }

    pub fn offer_create(
        ctx: Context<OfferCreate>,
        datetime: i64,
        timestamp: i64,
        nft_supply_ids: Vec<Pubkey>,
        nft_demand_ids: Vec<Pubkey>,
        bump: u8
    ) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let owner = &mut ctx.accounts.owner;
        let clock = &ctx.accounts.clock;

        offer_create.wallet_id = owner.to_account_info().key();
        offer_create.owner = id().key();
        offer_create.supply_1 = nft_supply_ids[0];
        offer_create.supply_2 = nft_supply_ids[1];
        offer_create.supply_3 = nft_supply_ids[2];
        offer_create.supply_4 = nft_supply_ids[3];
        offer_create.supply_5 = nft_supply_ids[4];
        offer_create.demand_1 = nft_demand_ids[0];
        offer_create.demand_2 = nft_demand_ids[1];
        offer_create.demand_3 = nft_demand_ids[2];
        offer_create.demand_4 = nft_demand_ids[3];
        offer_create.demand_5 = nft_demand_ids[4];
    
        offer_create.timestamp = timestamp;
        offer_create.created = clock.unix_timestamp;
        offer_create.expiration = datetime;
        offer_create.bump = bump;

        Ok(())
    }

    pub fn offer_delete(
        ctx: Context<OfferDelete>
    ) -> Result<()> {
        let offer_create = &mut ctx.accounts.offer_create;
        let payer = &mut ctx.accounts.payer;

        let starting_lamports = payer.to_account_info().lamports();
        **payer.to_account_info().lamports.borrow_mut() = starting_lamports
            .checked_add(offer_create.to_account_info().lamports())
            .unwrap();
        **offer_create.to_account_info().lamports.borrow_mut() = 0;

        let binding = offer_create.to_account_info();
        let mut offer_create_data = binding.data.borrow_mut();
        offer_create_data.fill(0);

        Ok(())
    }

    pub fn trader_create(
        ctx: Context<TradeCreate>
    ) -> Result<()> {

        let user_nft_account = &mut ctx.accounts.user_nft_account;
        let new_user_nft_account = &mut ctx.accounts.new_user_nft_account;
        let marketplace = &mut ctx.accounts.marketplace;
        let token_program = &ctx.accounts.token_program;

        let marketplace_account_seeds = &[&id().to_bytes(), MARKETPLACE_PREFIX, &[marketplace.bump]];

        let marketplace_account_signer = &[&marketplace_account_seeds[..]];

        let transfer_accounts = Transfer {
            from: user_nft_account.to_account_info(),
            to: new_user_nft_account.to_account_info(),
            authority: marketplace.to_account_info()
        };

        let transfer_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            transfer_accounts,
            marketplace_account_signer,
        );

        token::transfer(
            transfer_ctx,
            1
        )?;

        Ok(())

    }

}

#[derive(Accounts)]
#[instruction(bump:u8)]
pub struct InitializeMarketplaceAccount<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [&id().to_bytes(),MARKETPLACE_PREFIX],
        bump,
        space = 8 + 32 + 1,
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

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
        seeds = [&id().to_bytes(), MARKETPLACE_PREFIX],
        bump = marketplace.bump
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
        constraint = user_nft_account.mint == nft_mint.key() @ NFTDEXError::InvalidNFTAccountMint,
        constraint = user_nft_account.amount == 1 @ NFTDEXError::NFTAccountEmpty,
    )]
    pub user_nft_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetInactiveNFT<'info> {
    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(), MARKETPLACE_PREFIX],
        bump = marketplace.bump
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    pub nft_mint: Box<Account<'info, Mint>>,

    /// The token account from the owner
    #[account(
        mut,
        constraint = user_nft_account.mint == nft_mint.key() @ NFTDEXError::InvalidNFTAccountMint,
        constraint = user_nft_account.amount == 1 @ NFTDEXError::NFTAccountEmpty,
    )]
    pub user_nft_account: Account<'info, TokenAccount>,
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(
    datetime: i64,
    timestamp: i64,
    nft_supply_ids: Vec<Pubkey>,
    nft_demand_ids: Vec<Pubkey>,
    bump: u8
)]
pub struct OfferCreate<'info> {
    /// The offer account
    #[account(
        init,
        payer = payer,
        seeds=[&id().to_bytes(), OFFER_CREATE_ACCOUT_PREFIX, timestamp.to_string().as_str().as_ref()],
        bump,
        space= 8 + 8 * 3 + 32 * 12 + 1
    )]
    pub offer_create: Account<'info, OfferCreateAccount>,
    
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut, signer)]
    pub payer: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OfferDelete<'info> {
    /// The offer account
    #[account(mut)]
    pub offer_create: Account<'info, OfferCreateAccount>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut)]
    pub payer: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct TradeCreate<'info> {

    pub nft_mint: Box<Account<'info, Mint>>,

    /// The token account from the owner
    #[account(
        mut,
        constraint = user_nft_account.mint == nft_mint.key() @ NFTDEXError::InvalidNFTAccountMint,
        constraint = user_nft_account.amount == 1 @ NFTDEXError::NFTAccountEmpty,
    )]
    pub user_nft_account: Account<'info, TokenAccount>,

    /// The token account from the owner
    #[account(mut)]
    pub new_user_nft_account: Account<'info, TokenAccount>,

    /// The marketplace account
    #[account(
        mut,
        seeds = [&id().to_bytes(), MARKETPLACE_PREFIX],
        bump = marketplace.bump
    )]
    pub marketplace: Account<'info, MarketplaceAccount>,

    pub token_program: Program<'info, Token>,

}
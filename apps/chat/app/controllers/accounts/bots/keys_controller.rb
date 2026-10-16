class Accounts::Bots::KeysController < ApplicationController
  before_action :ensure_can_administer

  def update
    User.active_bots.find(params[:bot_id]).reset_bot_key
    redirect_to account_bots_url, notice: "New key made. Update the bot's integrations."
  end
end

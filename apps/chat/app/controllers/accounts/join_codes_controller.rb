class Accounts::JoinCodesController < ApplicationController
  before_action :ensure_can_administer
  before_action { head :not_found if NovawerkSso.configured? }

  def create
    Current.account.reset_join_code
    redirect_to edit_account_url
  end
end

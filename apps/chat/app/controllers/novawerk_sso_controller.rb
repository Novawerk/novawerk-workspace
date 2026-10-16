# GET /sso/novawerk?ticket=…: the Novawerk API sends people here after they signed in on
# novawerk.io (NovawerkSso). A good ticket starts a chat session; anything else goes back to the
# sign-in page, which says so.
#
# POST /sso/novawerk/events (Authorization: Bearer <event>): the API, server to server, when an
# account is deleted, suspended or closed, or its role changes.
class NovawerkSsoController < ApplicationController
  allow_unauthenticated_access
  skip_forgery_protection only: :events
  rate_limit to: 30, within: 1.minute, with: -> { head :too_many_requests }

  before_action { head :not_found unless NovawerkSso.configured? }

  def create
    claims = NovawerkSso.verify!(params[:ticket])

    if user = NovawerkSso.user_for(claims)
      start_new_session_for user
      redirect_to post_authenticating_url
    else
      redirect_to new_session_url(problem: "banned")
    end
  rescue NovawerkSso::InvalidTicket => error
    Rails.logger.info "[novawerk-sso] ticket refused: #{error.message}"
    redirect_to new_session_url(problem: "ticket")
  end

  def events
    event = request.authorization.to_s.delete_prefix("Bearer ")
    NovawerkSso.apply_event(NovawerkSso.verify!(event, audience: NovawerkSso::EVENT_AUDIENCE))
    head :no_content
  rescue NovawerkSso::InvalidTicket => error
    Rails.logger.info "[novawerk-sso] event refused: #{error.message}"
    head :unauthorized
  end
end

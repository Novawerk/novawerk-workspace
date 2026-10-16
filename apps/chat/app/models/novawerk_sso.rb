# Novawerk Chat signs in with the Novawerk account only (NB-ADR-0014). The Novawerk API's
# GET /auth/chat sends the browser to /sso/novawerk with a ticket: an HS256 JWT, 60 seconds,
# signed with CHAT_SSO_SECRET (the API has the same one). We check it, find or create the person
# by email, and copy their name, picture, bio and role each time. No passwords, no join links:
# profiles are edited on novawerk.io/settings.
#
# Off unless CHAT_SSO_SECRET is set; then Campfire's own sign-in, first run and join links answer
# as before (local development).
module NovawerkSso
  ISSUER = "nw-api"
  AUDIENCE = "novawerk-chat"
  LEEWAY = 5.seconds
  MAX_AGE = 2.minutes

  class InvalidTicket < StandardError; end

  class << self
    def configured?
      secret.present?
    end

    # Where signing in starts: the API turns the Novawerk session into a ticket.
    def sign_in_url
      "#{api_url}/auth/chat"
    end

    def settings_url
      "#{web_url}/settings"
    end

    def api_url
      ENV.fetch("NOVAWERK_API_URL", "https://api.novawerk.io").chomp("/")
    end

    def web_url
      ENV.fetch("NOVAWERK_WEB_URL", "https://novawerk.io").chomp("/")
    end

    # The ticket's claims, or InvalidTicket. Each ticket works once (its `jti`).
    def verify!(ticket, now: Time.current)
      claims = Ticket.decode!(ticket.to_s, secret)
      raise InvalidTicket, "wrong issuer" unless claims["iss"] == ISSUER
      raise InvalidTicket, "wrong audience" unless Array(claims["aud"]).include?(AUDIENCE)
      raise InvalidTicket, "expired" unless claims["exp"].is_a?(Integer) && now.to_i <= claims["exp"] + LEEWAY.to_i
      raise InvalidTicket, "too old" unless claims["iat"].is_a?(Integer) && claims["iat"] >= (now - MAX_AGE).to_i && claims["iat"] <= (now + LEEWAY).to_i
      raise InvalidTicket, "no subject" if claims["sub"].blank? || claims["jti"].blank?
      raise InvalidTicket, "no email" unless claims["email"].to_s.include?("@")
      raise InvalidTicket, "used" unless Rails.cache.write("novawerk-sso:jti:#{claims["jti"]}", true, unless_exist: true, expires_in: MAX_AGE + LEEWAY)
      claims
    end

    # The chat user for a checked ticket, created on first sign-in and brought up to date on every
    # one. Nil for someone banned here.
    def user_for(claims)
      email = claims["email"].to_s.strip.downcase
      user = User.where("lower(email_address) = ?", email).first
      return nil if user&.banned? || user&.bot?

      ensure_account
      user ||= User.new(email_address: email)
      was_administrator = user.persisted? && user.administrator?
      user.assign_attributes(
        name: claims["name"].presence || claims["handle"].presence || email.split("@").first,
        bio: claims["bio"].presence,
        role: claims["role"] == "maintainer" ? :administrator : :member,
        status: :active
      )
      user.save!

      RoomAccess.sync(user, was_administrator: was_administrator)
      ensure_first_room(user)
      AvatarJob.perform_later(user, claims["avatar"].presence)
      user
    end

    private
      def secret
        ENV["CHAT_SSO_SECRET"]
      end

      # The first sign-in sets the account up, as Campfire's first run did.
      def ensure_account
        Account.first || Account.create!(name: FirstRun::ACCOUNT_NAME)
      rescue ActiveRecord::RecordNotUnique
        Account.first
      end

      def ensure_first_room(user)
        return if Room.without_directs.exists?

        ::Rooms::Open.create!(name: FirstRun::FIRST_ROOM_NAME, creator: user).memberships.grant_to(User.active.where.not(role: :bot))
      end
  end
end

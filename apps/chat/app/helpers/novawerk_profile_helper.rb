# The Novawerk profile in the chat (NovawerkSso): @handle always, Werk and the link to
# novawerk.io/u/<handle> only when that profile is public.
module NovawerkProfileHelper
  def novawerk_handle_tag(user, **options)
    return if user.novawerk_handle.blank?

    tag.span("@#{user.novawerk_handle}", **options, class: [ "novawerk-handle", options[:class] ].compact.join(" "))
  end

  # "12 Werk · Profile on novawerk.io", for a public profile only.
  def novawerk_public_profile_tag(user)
    return unless user.novawerk_public? && user.novawerk_profile_url.present?

    tag.div(class: "novawerk-profile") do
      safe_join([
        (tag.span("#{user.novawerk_werk.to_i} Werk", class: "novawerk-profile__werk") unless user.novawerk_werk.nil?),
        link_to("Profile on novawerk.io", user.novawerk_profile_url, class: "novawerk-profile__link", target: "_blank", rel: "noopener")
      ].compact)
    end
  end
end

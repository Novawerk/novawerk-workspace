module ApplicationHelper
  def page_title_tag
    tag.title @page_title || "Novawerk Chat"
  end

  def current_user_meta_tags
    unless Current.user.nil?
      safe_join [
        tag(:meta, name: "current-user-id", content: Current.user.id),
        tag(:meta, name: "current-user-name", content: Current.user.name)
      ]
    end
  end

  def custom_styles_tag
    if custom_styles = Current.account&.custom_styles
      tag.style(custom_styles.to_s.html_safe, data: { turbo_track: "reload" })
    end
  end

  def body_classes
    [ @body_class, novawerk_shell_body_class, admin_body_class, account_logo_body_class ].compact.join(" ")
  end

  # Novawerk Chat: every signed-in page sits in the app shell (sidebar on the left), not only rooms.
  def novawerk_shell_body_class
    "sidebar" if Current.user && !@body_class.to_s.split.include?("sidebar")
  end

  # Novawerk Chat: the header of a page that isn't a room: a title, then actions on the right.
  # crumb_icon: a lucide icon before the crumb (hash or lock for a room).
  def page_header(title, crumb: nil, crumb_icon: nil, &actions)
    content_for :nav do
      heading = if crumb
        tag.h1(class: "nw-hdr-title nw-crumb") do
          parent = crumb_icon ? image_tag("#{crumb_icon}.svg", size: 14, class: "nw-crumb__icon") + tag.span(crumb) : crumb
          tag.span(parent, class: "nw-crumb__parent") + image_tag("chevron-right.svg", size: 14, class: "nw-crumb__sep") + tag.b(title)
        end
      else
        tag.h1(title, class: "nw-hdr-title")
      end
      back = link_to(image_tag("arrow-left.svg") + tag.span("Back"), "javascript:history.back()", class: "btn btn--plain nw-hdr-back")
      back + heading + (actions ? tag.div(class: "nw-hdr-actions", &actions) : "".html_safe)
    end
  end

  def link_back
    back_url = request.referrer
    back_url = root_path if back_url.nil? || back_url == request.url
    link_back_to back_url
  end

  def link_back_to(destination)
    link_to destination, class: "btn btn--plain" do
      image_tag("arrow-left.svg") + tag.span("Back")
    end
  end

  private
    # Header-only forgery protection needs no secret in forms or cached HTML.
    def token_tag(*)
      ""
    end

    def admin_body_class
      "admin" if Current.user&.can_administer?
    end

    def account_logo_body_class
      "account-has-logo" if Current.account&.logo&.attached?
    end
end

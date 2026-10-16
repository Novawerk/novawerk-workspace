require "zlib"

module Users::AvatarsHelper
  # Novawerk Chat: the design's soft tints, as [background, initials] pairs.
  AVATAR_TINTS = [
    %w[ #e3efe7 #0a3920 ], %w[ #e4ecf7 #173f73 ], %w[ #f7ecd9 #6b3f00 ], %w[ #f6e5e6 #7a1f27 ], %w[ #ececec #262626 ]
  ].freeze

  def avatar_tint(user)
    AVATAR_TINTS[Zlib.crc32(user.to_param) % AVATAR_TINTS.size]
  end

  def avatar_background_color(user)
    avatar_tint(user).first
  end

  def avatar_tag(user, **options)
    link_to user_path(user), title: user.title, class: "btn avatar", data: { turbo_frame: "_top" } do
      image_tag fresh_user_avatar_path(user), aria: { hidden: "true" }, size: 48, **options
    end
  end
end

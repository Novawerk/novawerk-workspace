# Novawerk Chat: Campfire draws its icons as <img> tags tinted with CSS filters, which turn blank
# when the page forces light mode and the OS is dark. Here every icon image Campfire asks for is
# drawn as an inline lucide <svg> in currentColor instead, so it follows the text colour.
# Other images (avatars, logos, uploads) still go through Rails' image_tag.
module NovawerkIconsHelper
  TINT_CLASSES = %w[ colorize--black colorize--white ].freeze

  def image_tag(source, options = {})
    name = source.is_a?(String) && source.end_with?(".svg") ? source.delete_suffix(".svg") : nil
    return super unless name && LucideIcons::ICONS.key?(name)

    icon_tag(name, **options.symbolize_keys)
  end

  def icon_tag(name, size: 16, alt: nil, aria: {}, **options)
    width, height = size.to_s.split("x").then { |w, h| [ w, h || w ] }
    classes = (Array(options.delete(:class)).flat_map { |c| c.to_s.split } - TINT_CLASSES)

    label = alt.presence
    accessibility = label ? { role: "img", aria: { label: label }.merge(aria) } : { aria: { hidden: "true" }.merge(aria) }

    tag.svg LucideIcons::ICONS.fetch(name).html_safe,
      **options, **accessibility,
      class: [ "lucide", *classes ].join(" "),
      width: width, height: height, viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round"
  end
end

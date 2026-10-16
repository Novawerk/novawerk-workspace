require "net/http"

# Copies the Novawerk profile picture into the chat, when it changed. Https only, images only,
# up to 2 MB, a few seconds at most; a failure leaves the picture as it was.
class NovawerkSso::AvatarJob < ApplicationJob
  MAX_BYTES = 2.megabytes
  TIMEOUT = 5
  MAX_REDIRECTS = 3

  def perform(user, url)
    if url.blank?
      user.avatar.purge if from_novawerk?(user)
      return
    end

    filename = "novawerk-#{Digest::SHA256.hexdigest(url).first(16)}"
    return if user.avatar.attached? && user.avatar.filename.to_s.start_with?(filename)

    body, content_type = fetch(URI(url))
    return unless body

    user.avatar.attach(io: StringIO.new(body), filename: "#{filename}.#{content_type.split("/").last}", content_type: content_type)
  rescue URI::InvalidURIError, SocketError, SystemCallError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError => error
    Rails.logger.warn "[novawerk-sso] avatar not copied: #{error.class}"
  end

  private
    def from_novawerk?(user)
      user.avatar.attached? && user.avatar.filename.to_s.start_with?("novawerk-")
    end

    def fetch(uri, redirects = 0)
      return unless uri.is_a?(URI::HTTPS)

      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: TIMEOUT, read_timeout: TIMEOUT) do |http|
        http.request(Net::HTTP::Get.new(uri)) do |response|
          case response
          when Net::HTTPRedirection
            return if redirects >= MAX_REDIRECTS
            return fetch(URI.join(uri, response["location"]), redirects + 1)
          when Net::HTTPSuccess
            content_type = response.content_type.to_s
            return unless content_type.start_with?("image/") && content_type != "image/svg+xml"

            body = +""
            response.read_body do |chunk|
              body << chunk
              return if body.bytesize > MAX_BYTES
            end
            return [ body, content_type ]
          end
        end
      end
      nil
    end
end

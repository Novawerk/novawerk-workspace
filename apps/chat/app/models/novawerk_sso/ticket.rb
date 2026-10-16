# A compact HS256 JWT, checked by hand: Campfire has no JWT library, and this is all we need.
# Only HS256 is accepted; the signature is compared in constant time before anything is read.
module NovawerkSso::Ticket
  extend self

  def decode!(token, secret)
    header_b64, payload_b64, signature_b64 = token.split(".", -1)
    raise NovawerkSso::InvalidTicket, "malformed" unless [ header_b64, payload_b64, signature_b64 ].all?(&:present?) && token.count(".") == 2

    expected = OpenSSL::HMAC.digest("SHA256", secret, "#{header_b64}.#{payload_b64}")
    given = decode64(signature_b64)
    raise NovawerkSso::InvalidTicket, "bad signature" unless given.bytesize == expected.bytesize && ActiveSupport::SecurityUtils.secure_compare(given, expected)

    header = JSON.parse(decode64(header_b64))
    raise NovawerkSso::InvalidTicket, "wrong algorithm" unless header.is_a?(Hash) && header["alg"] == "HS256"

    payload = JSON.parse(decode64(payload_b64))
    raise NovawerkSso::InvalidTicket, "malformed" unless payload.is_a?(Hash)
    payload
  rescue JSON::ParserError, ArgumentError
    raise NovawerkSso::InvalidTicket, "malformed"
  end

  # For tests and the console: what the Novawerk API signs.
  def encode(payload, secret)
    header = encode64({ alg: "HS256", typ: "JWT" }.to_json)
    body = encode64(payload.to_json)
    "#{header}.#{body}.#{encode64(OpenSSL::HMAC.digest("SHA256", secret, "#{header}.#{body}"))}"
  end

  private
    def decode64(value)
      Base64.urlsafe_decode64(value + "=" * ((4 - value.length % 4) % 4))
    end

    def encode64(value)
      Base64.urlsafe_encode64(value, padding: false)
    end
end

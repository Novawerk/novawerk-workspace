# Novawerk Chat: who is in a room, for everyone in it. "Members" in the room header, its "…" menu
# and the room intro open this list; changing who is in a closed room stays in the room's settings.
class Rooms::MembersController < ApplicationController
  include RoomScoped

  def show
    @users = @room.users.active.includes(avatar_attachment: :blob).ordered
  end
end

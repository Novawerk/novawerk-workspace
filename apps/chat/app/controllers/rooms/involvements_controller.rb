class Rooms::InvolvementsController < ApplicationController
  include RoomScoped

  def show
    @involvement = @membership.involvement
  end

  def update
    @membership.update! involvement: params[:involvement]

    broadcast_visibility_changes
    # Novawerk Chat: the bell menu in the room header comes back to the room.
    redirect_to params[:return_to_room] ? room_url(@room) : room_involvement_url(@room)
  end

  private
    def broadcast_visibility_changes
      case
      when @room.direct?
        # Do nothing
      when @membership.involved_in_invisible?
        broadcast_remove_to @membership.user, :rooms, target: [ @room, :list ]
      when @membership.involvement_previously_was.inquiry.invisible?
        broadcast_prepend_to @membership.user, :rooms, target: :shared_rooms, partial: "users/sidebars/rooms/shared", locals: { room: @room }
      end
    end
end

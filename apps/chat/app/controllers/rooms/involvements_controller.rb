class Rooms::InvolvementsController < ApplicationController
  include RoomScoped

  def show
    @involvement = @membership.involvement
  end

  def update
    previous = @membership.involvement
    @membership.update! involvement: params[:involvement]

    broadcast_visibility_changes
    # Novawerk Chat: the bell menu comes back to the room, My profile's menu to My profile. Hiding a
    # room says so, with Undo.
    if @membership.involved_in_invisible? && previous != "invisible"
      flash[:notice] = "##{@room.name} hidden from the sidebar"
      flash[:undo] = { "url" => room_involvement_path(@room), "involvement" => previous }
    end

    case
    when params[:return_to_room]    then redirect_to room_url(@room)
    when params[:return_to_profile] then redirect_to user_profile_url
    else                                 redirect_to room_involvement_url(@room)
    end
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

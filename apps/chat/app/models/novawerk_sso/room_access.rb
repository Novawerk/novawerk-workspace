# Maintainers see every room; members see the open ones, and closed rooms they are invited to
# (NB-ADR-0014). A maintainer gets every closed room at sign-in; someone who stops being one
# leaves them at their next sign-in.
module NovawerkSso::RoomAccess
  extend self

  def sync(user, was_administrator:)
    if user.administrator?
      missing = ::Rooms::Closed.where.not(id: user.memberships.select(:room_id))
      missing.find_each { |room| room.memberships.grant_to(user) }
    elsif was_administrator
      closed = user.memberships.where(room: ::Rooms::Closed.all)
      closed.destroy_all
      user.reset_remote_connections
    end
  end
end

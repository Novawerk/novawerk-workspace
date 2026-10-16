# The Novawerk profile the chat shows (NovawerkSso, NB-ADR-0014): @handle always; Werk and the
# profile link only for a public profile, so they are null otherwise.
class AddNovawerkProfileToUsers < ActiveRecord::Migration[8.2]
  def change
    add_column :users, :novawerk_handle, :string
    add_column :users, :novawerk_public, :boolean, null: false, default: false
    add_column :users, :novawerk_werk, :integer
    add_column :users, :novawerk_profile_url, :string
  end
end

export type ContentKind = 'page' | 'post'

export interface WordPressTextField {
  raw?: string | undefined
  rendered?: string | undefined
}

export interface WordPressContent {
  id: number
  date_gmt?: string | undefined
  modified_gmt: string
  slug: string
  status: string
  link: string
  title: WordPressTextField
  content: WordPressTextField
  excerpt: WordPressTextField
  parent?: number | undefined
  categories?: number[] | undefined
  featured_media?: number | undefined
  menu_order?: number | undefined
}

export interface WordPressMedia {
  id: number
  modified_gmt: string
  slug: string
  status: string
  link: string
  source_url: string
  mime_type: string
  post: number
  title: WordPressTextField
  caption: WordPressTextField
  description: WordPressTextField
  alt_text: string
}

export interface ContentFieldsInput {
  title?: string | undefined
  slug?: string | undefined
  contentHtml?: string | undefined
  excerpt?: string | undefined
  status?: 'draft' | 'pending' | 'private' | 'publish' | 'future' | undefined
  parentId?: number | undefined
  categoryIds?: number[] | undefined
  featuredMediaId?: number | undefined
  menuOrder?: number | undefined
}

export interface MediaFieldsInput {
  title?: string | undefined
  altText?: string | undefined
  caption?: string | undefined
  description?: string | undefined
  postId?: number | undefined
}

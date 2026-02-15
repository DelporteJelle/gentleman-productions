import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  TextInput,
  Textarea,
  Group,
  Button,
  Stack,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { DbObjectType, BasicPost } from "@/types";
import { useForm } from "@mantine/form";
import { usePosts } from "@/app/contexts/PostsContext";

interface CreateBasicPostModalProps {
  opened: boolean;
  onClose: () => void;
  basicPost?: BasicPost;
}

export default function CreateBasicPostModal({
  opened,
  onClose,
  basicPost,
}: CreateBasicPostModalProps) {
  const { createBasicPost, updateBasicPost } = usePosts();

  const getInitialValues = useCallback(() => {
    if (basicPost) {
      return {
        ...basicPost,
        date: basicPost.date ? new Date(basicPost.date) : null,
      };
    }
    return {
      uuid: crypto.randomUUID() as string,
      created_at: new Date().toISOString(),
      updated_at: undefined,
      post_type: DbObjectType.BASIC_POST as const,
      title: "",
      description: "",
      display_image: "",
      link: "",
      link_text: "",
      date: null as Date | null,
      location: "",
    };
  }, [basicPost]);

  const form = useForm({
    mode: "controlled",
    initialValues: getInitialValues(),
    validate: {
      title: (value) => (value.trim() ? null : "Title is required"),
      display_image: (value) =>
        value.trim() ? null : "Display image URL is required",
    },
  });

  // Reset form when modal opens/closes or basicPost changes
  useEffect(() => {
    if (opened) {
      form.setValues(getInitialValues());
    }
  }, [opened, basicPost?.uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(() => {
    form.validate();
    if (!form.isValid()) return;

    const postData = {
      ...form.values,
      updated_at: new Date().toISOString(),
      date: form.values.date
        ? new Date(form.values.date).toISOString()
        : null,
    };

    if (basicPost) {
      updateBasicPost(basicPost.uuid, postData as BasicPost);
    } else {
      createBasicPost(postData as BasicPost);
    }
    onClose();
  }, [form, basicPost, createBasicPost, updateBasicPost, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={basicPost ? "Edit Post" : "Create New Post"}
      size="lg"
    >
      <Stack>
        <TextInput
          required
          label="Title"
          placeholder="Enter post title"
          key={form.key("title")}
          {...form.getInputProps("title")}
        />
        <Textarea
          label="Description"
          placeholder="Enter post description (optional)"
          key={form.key("description")}
          {...form.getInputProps("description")}
        />
        <TextInput
          required
          label="Display Image URL"
          description="Images need to be hosted externally. You can use OneDrive by uploading the image, clicking the 3 dots (more actions), click </>embed and copy paste the URL"
          placeholder="Enter display image URL"
          key={form.key("display_image")}
          {...form.getInputProps("display_image")}
        />
        <DateInput
          label="Date"
          placeholder="Select a date (optional)"
          clearable
          key={form.key("date")}
          {...form.getInputProps("date")}
        />
        <TextInput
          label="Location"
          placeholder="Enter location (optional)"
          key={form.key("location")}
          {...form.getInputProps("location")}
        />
        <TextInput
          label="Link"
          placeholder="Enter external link (optional)"
          description="This is the URL that the button will link to. Make sure to include https://"
          key={form.key("link")}
          {...form.getInputProps("link")}
        />
        <TextInput
          label="Link Text"
          placeholder="Enter link button text (optional)"
          description="This is the text that will appear on the button. For example: 'Learn More' or 'Buy Tickets'"
          key={form.key("link_text")}
          {...form.getInputProps("link_text")}
        />
      </Stack>

      <Group justify="center" mt="xl">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button color="red" onClick={handleSubmit}>
          {basicPost ? "Update Post" : "Create Post"}
        </Button>
      </Group>
    </Modal>
  );
}
